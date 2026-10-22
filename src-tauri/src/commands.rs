use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::backup_manager::BackupManager;
use crate::config_manager::ConfigManager;
use crate::database::Database;
use crate::extension_manager::{ExtensionManager, ModrinthSearchResponse, ModrinthVersion};
use crate::java_manager::JavaManager;
use crate::mcp_tools::McpToolEngine;
use crate::models::{
    AiChatMessage, AiProviderConfig, BackupRecord, ConfigDiff, CreateServerRequest, ExtensionItem,
    JavaRuntime, McpToolCall, McpToolResult, OperationRecord, ServerConfigItem, ServerProfile,
    ServerStatus, ServerType,
};
use crate::security::SecurityPolicy;
use crate::server_lifecycle::ServerLifecycleManager;
use crate::ai_agent::AiAgent;
use crate::portal_manager::PortalManager;
use crate::software_manager::SoftwareProviderManager;
use crate::modpack_manager::ModpackManager;
use crate::models::{VersionManifest, ProviderBuildInfo, PortalServerStatus, PendingCommandApproval, BannedIp, BannedPlayer, FileEntry, OpPlayer, ServerPlayerData, WhitelistPlayer, WorldDetails, ServerStatusState};
use serde_json::json;

pub struct AppState {
    pub db: Database,
    pub lifecycle: ServerLifecycleManager,
    pub mcp_engine: Arc<McpToolEngine>,
    pub ai_agent: Arc<AiAgent>,
    pub software_manager: Arc<SoftwareProviderManager>,
    pub portal_manager: Arc<PortalManager>,
    pub modpack_manager: Arc<ModpackManager>,
    pub data_dir: PathBuf,
}

#[tauri::command]
pub async fn list_servers(state: State<'_, AppState>) -> Result<Vec<ServerProfile>, String> {
    state.db.list_servers().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_server(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Option<ServerProfile>, String> {
    state.db.get_server(&server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_server(
    state: State<'_, AppState>,
    req: CreateServerRequest,
) -> Result<ServerProfile, String> {
    SecurityPolicy::validate_server_name(&req.name).map_err(|e| e.to_string())?;

    let min_ram = req.min_ram_mb.unwrap_or(1024);
    let max_ram = req.max_ram_mb.unwrap_or(2048);
    SecurityPolicy::validate_memory(min_ram, max_ram).map_err(|e| e.to_string())?;

    let port = req.port.unwrap_or(25565);
    SecurityPolicy::validate_port(port).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let sanitized_dir_name = req
        .name
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-', "_");
    let server_dir = state
        .data_dir
        .join("servers")
        .join(format!("{}_{}", sanitized_dir_name, &id[..8]));

    std::fs::create_dir_all(&server_dir).map_err(|e| e.to_string())?;

    // Create subfolders: plugins, mods, backups, logs
    std::fs::create_dir_all(server_dir.join("plugins")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(server_dir.join("mods")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(server_dir.join("backups")).map_err(|e| e.to_string())?;

    // Write initial server.properties
    let mut initial_props = BTreeMap::new();
    initial_props.insert("server-port".to_string(), port.to_string());
    initial_props.insert("motd".to_string(), format!("{} - Powered by MCSet", req.name));
    initial_props.insert("difficulty".to_string(), "easy".to_string());
    initial_props.insert("gamemode".to_string(), "survival".to_string());
    let online_mode = req.online_mode.unwrap_or(true);
    initial_props.insert("online-mode".to_string(), online_mode.to_string());
    let _ = ConfigManager::apply_changes(&server_dir, &initial_props);

    // EULA
    if req.accept_eula {
        let _ = ServerLifecycleManager::ensure_eula(&server_dir, true);
    }

    // Handle import mode: "zip", "directory", or fresh download
    let import_mode = req.import_mode.as_deref().unwrap_or("fresh");
    let mut jar_file = String::new();

    if import_mode == "zip" {
        let zip_path_str = req
            .import_zip_path
            .as_ref()
            .ok_or_else(|| "Missing 'import_zip_path'".to_string())?;
        let zip_path = PathBuf::from(zip_path_str);
        if !zip_path.exists() {
            return Err(format!("Uploaded zip file not found at {:?}", zip_path));
        }

        let file = std::fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
        let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| format!("Failed to read zip entry: {}", e))?;
            let outpath = match file.enclosed_name() {
                Some(path) => server_dir.join(path),
                None => continue,
            };

            if (*file.name()).ends_with('/') {
                std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }

        // Detect server jar inside imported files
        if let Ok(entries) = std::fs::read_dir(&server_dir) {
            for entry in entries.filter_map(Result::ok) {
                let p = entry.path();
                if p.is_file() && p.extension().map(|e| e == "jar").unwrap_or(false) {
                    let fname = p.file_name().unwrap().to_string_lossy().to_string();
                    if fname.contains("server") || fname.contains("paper") || fname.contains("spigot") || fname.contains("purpur") || fname.contains("fabric") || fname.contains("forge") || fname.contains("vanilla") {
                        jar_file = fname;
                        break;
                    }
                }
            }
        }
    } else if import_mode == "directory" {
        let existing_dir_str = req
            .existing_dir_path
            .as_ref()
            .ok_or_else(|| "Missing 'existing_dir_path'".to_string())?;
        let src_dir = PathBuf::from(existing_dir_str);
        if !src_dir.exists() || !src_dir.is_dir() {
            return Err(format!("Selected server directory not found at {:?}", src_dir));
        }

        // Copy files from existing directory into server_dir
        for entry in walkdir::WalkDir::new(&src_dir).min_depth(1) {
            if let Ok(entry) = entry {
                let rel = entry.path().strip_prefix(&src_dir).map_err(|e| e.to_string())?;
                let target = server_dir.join(rel);
                if entry.file_type().is_dir() {
                    let _ = std::fs::create_dir_all(&target);
                } else if entry.file_type().is_file() {
                    if let Some(parent) = target.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    let _ = std::fs::copy(entry.path(), &target);
                }
            }
        }

        // Detect server jar
        if let Ok(entries) = std::fs::read_dir(&server_dir) {
            for entry in entries.filter_map(Result::ok) {
                let p = entry.path();
                if p.is_file() && p.extension().map(|e| e == "jar").unwrap_or(false) {
                    let fname = p.file_name().unwrap().to_string_lossy().to_string();
                    if fname.contains("server") || fname.contains("paper") || fname.contains("spigot") || fname.contains("purpur") || fname.contains("fabric") || fname.contains("forge") || fname.contains("vanilla") {
                        jar_file = fname;
                        break;
                    }
                }
            }
        }
    }

    // If no server jar was found in imported files or this is a fresh server, download it
    if jar_file.is_empty() {
        let build_info = state
            .software_manager
            .resolve_provider_build(&req.server_type, &req.minecraft_version)
            .await
            .map_err(|e| format!("Failed to resolve server software: {}", e))?;

        jar_file = build_info.target_jar.clone();

        state
            .software_manager
            .download_and_install(
                None,
                &server_dir,
                &build_info,
                req.java_path.as_deref(),
            )
            .await
            .map_err(|e| format!("Failed to install server software: {}", e))?;
    }

    let resolved_java = if let Some(ref j) = req.java_path {
        if !j.trim().is_empty() {
            Some(j.clone())
        } else {
            JavaManager::find_or_install_compatible_java(&state.data_dir, &req.minecraft_version, None).await.ok()
        }
    } else {
        JavaManager::find_or_install_compatible_java(&state.data_dir, &req.minecraft_version, None).await.ok()
    };

    let now = chrono::Utc::now().timestamp();
    let profile = ServerProfile {
        id: id.clone(),
        name: req.name.clone(),
        server_type: req.server_type,
        minecraft_version: req.minecraft_version,
        java_path: resolved_java,
        min_ram_mb: min_ram,
        max_ram_mb: max_ram,
        jvm_flags: req.jvm_flags.unwrap_or_else(|| "-XX:+UseG1GC".to_string()),
        server_dir: server_dir.to_string_lossy().to_string(),
        jar_file,
        port,
        eula_accepted: req.accept_eula,
        autostart: false,
        created_at: now,
        updated_at: now,
    };

    state.db.insert_server(&profile).map_err(|e| e.to_string())?;
    state
        .db
        .record_operation(
            Some(&id),
            "create_server",
            &format!("Created server '{}' at {:?}", profile.name, server_dir),
            true,
        )
        .map_err(|e| e.to_string())?;

    Ok(profile)
}

#[tauri::command]
pub async fn update_server_profile(
    state: State<'_, AppState>,
    profile: ServerProfile,
) -> Result<ServerProfile, String> {
    SecurityPolicy::validate_server_name(&profile.name).map_err(|e| e.to_string())?;
    SecurityPolicy::validate_memory(profile.min_ram_mb, profile.max_ram_mb).map_err(|e| e.to_string())?;
    SecurityPolicy::validate_port(profile.port).map_err(|e| e.to_string())?;

    let mut updated = profile;
    updated.updated_at = chrono::Utc::now().timestamp();
    state.db.update_server(&updated).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_server(
    state: State<'_, AppState>,
    server_id: String,
    delete_files: bool,
) -> Result<bool, String> {
    if let Some(server) = state.db.get_server(&server_id).map_err(|e| e.to_string())? {
        let _ = state.lifecycle.stop_server(&server_id);
        if delete_files {
            let path = PathBuf::from(&server.server_dir);
            if path.exists() {
                let _ = std::fs::remove_dir_all(path);
            }
        }
        state.db.delete_server(&server_id).map_err(|e| e.to_string())?;
        state
            .db
            .record_operation(Some(&server_id), "delete_server", &format!("Deleted server {}", server.name), true)
            .map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn start_server(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server profile not found".to_string())?;

    state
        .lifecycle
        .start_server(app.clone(), &server)
        .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn stop_server(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, String> {
    state.lifecycle.stop_server(&server_id).map_err(|e| e.to_string())?;
    // Stop Portal tunnel for this server if active
    state.portal_manager.stop_tunnel(&server_id, Some(&app));
    Ok(true)
}

#[tauri::command]
pub async fn restart_server(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server profile not found".to_string())?;

    state
        .lifecycle
        .restart_server(app.clone(), &server)
        .map_err(|e| e.to_string())?;

    Ok(true)
}

#[tauri::command]
pub async fn send_console_command(
    state: State<'_, AppState>,
    server_id: String,
    command: String,
) -> Result<bool, String> {
    state
        .lifecycle
        .send_command(&server_id, &command)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn get_server_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<ServerStatus, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    Ok(state.lifecycle.get_status(&server_id, server.port))
}

#[tauri::command]
pub async fn get_server_logs(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<String>, String> {
    Ok(state.lifecycle.get_logs(&server_id))
}

#[tauri::command]
pub async fn detect_java_runtimes() -> Result<Vec<JavaRuntime>, String> {
    Ok(JavaManager::detect_all_runtimes())
}

#[tauri::command]
pub async fn download_java_runtime(
    app: AppHandle,
    state: State<'_, AppState>,
    major_version: u32,
) -> Result<JavaRuntime, String> {
    JavaManager::download_and_install_jdk(&state.data_dir, major_version, Some(&app)).await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auto_fix_server_java(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    target_major: Option<u32>,
) -> Result<ServerProfile, String> {
    let mut server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server profile not found".to_string())?;

    // Stop server if running
    let _ = state.lifecycle.stop_server(&server_id);
    state.portal_manager.stop_tunnel(&server_id, Some(&app));

    let needed_major = match target_major {
        Some(m) => m,
        None => {
            if let Ok(m) = state.software_manager.get_required_java_version(&server.minecraft_version).await {
                m
            } else {
                JavaManager::get_recommended_java_major(&server.minecraft_version).0
            }
        }
    };

    let runtimes = JavaManager::detect_all_runtimes();
    let java_path = if let Some(found) = runtimes.iter().find(|r| r.major_version == needed_major) {
        found.path.clone()
    } else {
        let installed = JavaManager::download_and_install_jdk(&state.data_dir, needed_major, Some(&app)).await
            .map_err(|e| format!("Failed to install Java {}: {}", needed_major, e))?;
        installed.path
    };

    server.java_path = Some(java_path);
    server.updated_at = chrono::Utc::now().timestamp();
    state.db.update_server(&server).map_err(|e| e.to_string())?;

    let _ = app.emit("servers-changed", ());

    // Restart server automatically
    let _ = state.lifecycle.start_server(app.clone(), &server);

    Ok(server)
}

#[tauri::command]
pub async fn get_server_config(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<ServerConfigItem>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ConfigManager::read_config(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn propose_server_config(
    state: State<'_, AppState>,
    server_id: String,
    updates: BTreeMap<String, String>,
) -> Result<Vec<ConfigDiff>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ConfigManager::propose_changes(&path, &updates).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_server_config(
    state: State<'_, AppState>,
    server_id: String,
    updates: BTreeMap<String, String>,
) -> Result<Vec<ConfigDiff>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    let diffs = ConfigManager::apply_changes(&path, &updates).map_err(|e| e.to_string())?;
    state
        .db
        .record_operation(
            Some(&server_id),
            "apply_config",
            &format!("Applied {} configuration changes", diffs.len()),
            true,
        )
        .map_err(|e| e.to_string())?;
    Ok(diffs)
}

#[tauri::command]
pub async fn read_raw_config(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
) -> Result<String, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ConfigManager::read_raw(&path, &file_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_raw_config(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
    content: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ConfigManager::write_raw(&path, &file_name, &content).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn list_extensions(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<ExtensionItem>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ExtensionManager::list_installed(&path, &server.server_type).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_extension(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
) -> Result<String, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    let new_name = ExtensionManager::toggle_extension(&path, &server.server_type, &file_name)
        .map_err(|e| e.to_string())?;
    Ok(new_name)
}

#[tauri::command]
pub async fn remove_extension(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);
    ExtensionManager::remove_extension(&path, &server.server_type, &file_name)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn search_modrinth(
    state: State<'_, AppState>,
    server_id: String,
    query: String,
    index: Option<String>,
    offset: Option<u32>,
) -> Result<ModrinthSearchResponse, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    ExtensionManager::search_modrinth(
        &query,
        &server.server_type,
        &server.minecraft_version,
        index.as_deref(),
        offset.unwrap_or(0),
        20,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_modrinth_versions(
    state: State<'_, AppState>,
    server_id: String,
    project_id: String,
) -> Result<Vec<ModrinthVersion>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    ExtensionManager::get_project_versions(
        &project_id,
        &server.server_type,
        Some(&server.minecraft_version),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_modrinth_extension(
    state: State<'_, AppState>,
    server_id: String,
    version_file_url: String,
    filename: String,
    sha512: Option<String>,
) -> Result<String, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);

    let ver_file = crate::extension_manager::ModrinthVersionFile {
        url: version_file_url,
        filename,
        primary: true,
        size: 0,
        hashes: crate::extension_manager::ModrinthFileHashes {
            sha1: None,
            sha512,
        },
    };

    let installed = ExtensionManager::download_and_install(&path, &server.server_type, &ver_file)
        .await
        .map_err(|e| e.to_string())?;

    state
        .db
        .record_operation(
            Some(&server_id),
            "install_extension",
            &format!("Installed {}", installed),
            true,
        )
        .map_err(|e| e.to_string())?;

    Ok(installed)
}

#[tauri::command]
pub async fn list_backups(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<BackupRecord>, String> {
    state.db.list_backups(&server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_backup(
    state: State<'_, AppState>,
    server_id: String,
    description: String,
) -> Result<BackupRecord, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);

    let rec = BackupManager::create_backup(&path, &server_id, &description).map_err(|e| e.to_string())?;
    state.db.insert_backup(&rec).map_err(|e| e.to_string())?;
    state
        .db
        .record_operation(Some(&server_id), "create_backup", &format!("Created backup {}", rec.file_name), true)
        .map_err(|e| e.to_string())?;
    Ok(rec)
}

#[tauri::command]
pub async fn restore_backup(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);

    let _ = state.lifecycle.stop_server(&server_id);
    BackupManager::restore_backup(&path, &file_name).map_err(|e| e.to_string())?;
    state
        .db
        .record_operation(Some(&server_id), "restore_backup", &format!("Restored backup {}", file_name), true)
        .map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_backup(
    state: State<'_, AppState>,
    server_id: String,
    backup_id: String,
    file_name: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let path = PathBuf::from(&server.server_dir);

    BackupManager::delete_backup(&path, &file_name).map_err(|e| e.to_string())?;
    state.db.delete_backup(&backup_id).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn list_operations(
    state: State<'_, AppState>,
    server_id: Option<String>,
) -> Result<Vec<OperationRecord>, String> {
    state.db.list_operations(server_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_mcp_tool(
    state: State<'_, AppState>,
    call: McpToolCall,
) -> Result<McpToolResult, String> {
    Ok(state.mcp_engine.execute_tool(&call).await)
}

#[tauri::command]
pub async fn get_mcp_tools() -> Result<Vec<serde_json::Value>, String> {
    Ok(McpToolEngine::get_tool_definitions())
}

#[tauri::command]
pub async fn get_ai_config(state: State<'_, AppState>) -> Result<AiProviderConfig, String> {
    let provider = state
        .db
        .get_setting("ai_provider")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "openai".to_string());
    let api_key = state
        .db
        .get_setting("ai_api_key")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let model = state
        .db
        .get_setting("ai_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gpt-4o-mini".to_string());
    let base_url = state.db.get_setting("ai_base_url").map_err(|e| e.to_string())?;

    Ok(AiProviderConfig {
        provider,
        api_key,
        model,
        base_url,
    })
}

#[tauri::command]
pub async fn save_ai_config(
    state: State<'_, AppState>,
    config: AiProviderConfig,
) -> Result<bool, String> {
    state.db.set_setting("ai_provider", &config.provider).map_err(|e| e.to_string())?;
    state.db.set_setting("ai_api_key", &config.api_key).map_err(|e| e.to_string())?;
    state.db.set_setting("ai_model", &config.model).map_err(|e| e.to_string())?;
    if let Some(ref base) = config.base_url {
        state.db.set_setting("ai_base_url", base).map_err(|e| e.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
pub async fn chat_with_ai(
    state: State<'_, AppState>,
    messages: Vec<AiChatMessage>,
    active_server_id: Option<String>,
) -> Result<Vec<AiChatMessage>, String> {
    let config = get_ai_config(state.clone()).await?;
    state
        .ai_agent
        .chat(&config, messages, active_server_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_ai(state: State<'_, AppState>) -> Result<bool, String> {
    state.ai_agent.stop();
    Ok(true)
}

#[tauri::command]
pub async fn get_minecraft_versions(
    state: State<'_, AppState>,
    force_refresh: Option<bool>,
) -> Result<VersionManifest, String> {
    state
        .software_manager
        .get_version_manifest(force_refresh.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_minecraft_required_java(
    state: State<'_, AppState>,
    minecraft_version: String,
) -> Result<u32, String> {
    state
        .software_manager
        .get_required_java_version(&minecraft_version)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_provider_build(
    state: State<'_, AppState>,
    provider: ServerType,
    minecraft_version: String,
) -> Result<ProviderBuildInfo, String> {
    state
        .software_manager
        .resolve_provider_build(&provider, &minecraft_version)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_server_directory(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let path = std::path::PathBuf::from(&server.server_dir);
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| format!("Failed to create server directory: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&server.server_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory in Explorer: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&server.server_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory in Finder: {}", e))?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&server.server_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn open_browser_url(url: String) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL in browser: {}", e))?;
    }

    Ok(true)
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct NetworkAddresses {
    pub local_ip: String,
    pub lan_ip: Option<String>,
}

#[tauri::command]
pub async fn get_network_addresses() -> Result<NetworkAddresses, String> {
    let lan_ip = std::net::UdpSocket::bind("0.0.0.0:0")
        .ok()
        .and_then(|socket| {
            socket.connect("8.8.8.8:80").ok()?;
            let addr = socket.local_addr().ok()?;
            let ip = addr.ip().to_string();
            if ip == "0.0.0.0" || ip == "127.0.0.1" {
                None
            } else {
                Some(ip)
            }
        });

    Ok(NetworkAddresses {
        local_ip: "127.0.0.1".to_string(),
        lan_ip,
    })
}

#[tauri::command]
pub async fn start_portal_tunnel(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<PortalServerStatus, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    state
        .portal_manager
        .start_tunnel(app, &server)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_portal_tunnel(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<PortalServerStatus, String> {
    Ok(state.portal_manager.stop_tunnel(&server_id, Some(&app)))
}

#[tauri::command]
pub async fn get_portal_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<PortalServerStatus, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let port = PortalManager::resolve_server_port(&server);
    Ok(state.portal_manager.get_status(&server_id, port))
}

#[tauri::command]
pub async fn get_portal_logs(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<String>, String> {
    Ok(state.portal_manager.get_logs(&server_id))
}

#[tauri::command]
pub async fn verify_portal_connectivity(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
) -> Result<PortalServerStatus, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    state
        .portal_manager
        .verify_connectivity_for_server(app, &server)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_console_command(
    app: AppHandle,
    state: State<'_, AppState>,
    approval_id: String,
) -> Result<serde_json::Value, String> {
    let approval = {
        let mut apps = state.mcp_engine.approvals.lock().unwrap();
        apps.remove(&approval_id)
            .ok_or_else(|| "Approval request not found or already processed".to_string())?
    };

    let now = chrono::Utc::now().timestamp();
    if now > approval.expires_at {
        return Err("This command approval request has expired".to_string());
    }

    state
        .lifecycle
        .send_command(&approval.server_id, &approval.command)
        .map_err(|e| format!("Failed to send approved command: {}", e))?;

    let result = serde_json::json!({
        "status": "approved_and_executed",
        "approval_id": approval_id,
        "server_id": approval.server_id,
        "server_name": approval.server_name,
        "command": approval.command,
        "success": true,
        "message": format!("Command '{}' approved and executed successfully.", approval.command)
    });

    use tauri::Emitter;
    let _ = app.emit("console-command-approved", &result);

    Ok(result)
}

#[tauri::command]
pub async fn reject_console_command(
    app: AppHandle,
    state: State<'_, AppState>,
    approval_id: String,
) -> Result<bool, String> {
    let mut apps = state.mcp_engine.approvals.lock().unwrap();
    if let Some(approval) = apps.remove(&approval_id) {
        use tauri::Emitter;
        let _ = app.emit("console-command-rejected", serde_json::json!({
            "approval_id": approval_id,
            "command": approval.command,
            "server_id": approval.server_id
        }));
        Ok(true)
    } else {
        Ok(false)
    }
}

#[tauri::command]
pub async fn list_pending_approvals(
    state: State<'_, AppState>,
) -> Result<Vec<PendingCommandApproval>, String> {
    let now = chrono::Utc::now().timestamp();
    let mut apps = state.mcp_engine.approvals.lock().unwrap();
    apps.retain(|_, a| a.expires_at > now);
    Ok(apps.values().cloned().collect())
}

#[tauri::command]
pub async fn search_modpacks(
    state: State<'_, AppState>,
    provider: String,
    query: String,
    minecraft_version: Option<String>,
    loader: Option<String>,
    offset: u32,
    limit: u32,
    curseforge_api_key: Option<String>,
) -> Result<crate::models::ModpackSearchResponse, String> {
    state
        .modpack_manager
        .search_modpacks(
            &provider,
            &query,
            minecraft_version.as_deref(),
            loader.as_deref(),
            offset,
            limit,
            curseforge_api_key.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_modpack_versions(
    state: State<'_, AppState>,
    provider: String,
    project_id: String,
    curseforge_api_key: Option<String>,
) -> Result<Vec<crate::models::ModpackVersionInfo>, String> {
    state
        .modpack_manager
        .get_modpack_versions(&provider, &project_id, curseforge_api_key.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_modpack_server(
    state: State<'_, AppState>,
    app: AppHandle,
    req: crate::models::InstallModpackRequest,
) -> Result<ServerProfile, String> {
    let profile = state
        .modpack_manager
        .install_modpack_server(app, req)
        .await
        .map_err(|e| e.to_string())?;

    state.db.insert_server(&profile).map_err(|e| e.to_string())?;
    let _ = state.db.record_operation(
        Some(&profile.id),
        "install_modpack_server",
        &format!("Installed modpack server '{}' ({:?} {})", profile.name, profile.server_type, profile.minecraft_version),
        true,
    );

    Ok(profile)
}

#[tauri::command]
pub async fn cancel_modpack_install(
    state: State<'_, AppState>,
    install_id: String,
) -> Result<(), String> {
    state.modpack_manager.cancel_install(&install_id);
    Ok(())
}





// ==========================================
// NEW: LOCAL FILE PICKER & EXTENSION UPLOAD
// ==========================================

#[tauri::command]
pub async fn pick_local_file(
    title: Option<String>,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(t) = title {
            dialog = dialog.set_title(&t);
        }
        if let (Some(name), Some(exts)) = (filter_name, extensions) {
            let ext_refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            dialog = dialog.add_filter(&name, &ext_refs);
        }
        let file = dialog.pick_file();
        Ok(file.map(|p| p.to_string_lossy().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn install_local_extension(
    state: State<'_, AppState>,
    server_id: String,
    file_name: String,
    file_bytes: Vec<u8>,
) -> Result<ExtensionItem, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let is_modded = matches!(
        server.server_type,
        ServerType::Fabric | ServerType::Forge | ServerType::NeoForge | ServerType::Quilt
    );
    let target_folder = if is_modded { "mods" } else { "plugins" };
    let folder_path = std::path::PathBuf::from(&server.server_dir).join(target_folder);
    std::fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;

    let safe_filename = std::path::Path::new(&file_name)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;

    if !safe_filename.ends_with(".jar") && !safe_filename.ends_with(".jar.disabled") {
        return Err("Only .jar files can be installed as mods or plugins".to_string());
    }

    let dest_path = folder_path.join(safe_filename);
    std::fs::write(&dest_path, &file_bytes).map_err(|e| format!("Failed to write extension file: {}", e))?;

    let size_bytes = file_bytes.len() as u64;
    Ok(ExtensionItem {
        file_name: safe_filename.to_string(),
        name: safe_filename.replace(".jar", "").replace(".disabled", ""),
        version: None,
        extension_type: if is_modded { "mod".to_string() } else { "plugin".to_string() },
        enabled: !safe_filename.ends_with(".disabled"),
        file_size_bytes: size_bytes,
        modified_at: chrono::Utc::now().timestamp_millis(),
    })
}

// ==========================================
// NEW: PLAYER MANAGEMENT
// ==========================================

fn find_cached_player_uuid(sdir: &std::path::Path, player_name: &str) -> Option<String> {
    let ucache_path = sdir.join("usercache.json");
    if ucache_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&ucache_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    if let Some(name) = item.get("name").and_then(|n| n.as_str()) {
                        if name.eq_ignore_ascii_case(player_name) {
                            if let Some(uuid) = item.get("uuid").and_then(|u| u.as_str()) {
                                return Some(uuid.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn get_server_player_data(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<ServerPlayerData, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);

    let mut whitelist_map: std::collections::BTreeMap<String, WhitelistPlayer> = std::collections::BTreeMap::new();
    let whitelist_path = sdir.join("whitelist.json");
    if whitelist_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&whitelist_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let uuid = item.get("uuid").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let trimmed = name.trim();
                    if !trimmed.is_empty() {
                        let key = trimmed.to_lowercase();
                        whitelist_map.entry(key).or_insert(WhitelistPlayer {
                            uuid,
                            name: trimmed.to_string(),
                        });
                    }
                }
            }
        }
    }
    let whitelist: Vec<WhitelistPlayer> = whitelist_map.into_values().collect();

    let mut ops_map: std::collections::BTreeMap<String, OpPlayer> = std::collections::BTreeMap::new();
    let ops_path = sdir.join("ops.json");
    if ops_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&ops_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let uuid = item.get("uuid").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let level = item.get("level").and_then(|v| v.as_u64()).map(|n| n as u8);
                    let bypasses_player_limit = item.get("bypassesPlayerLimit").and_then(|v| v.as_bool());
                    let trimmed = name.trim();
                    if !trimmed.is_empty() {
                        let key = trimmed.to_lowercase();
                        let existing = ops_map.get(&key);
                        let should_replace = if let Some(ex) = existing {
                            (ex.uuid.is_none() && uuid.is_some()) || level.unwrap_or(0) > ex.level.unwrap_or(0)
                        } else {
                            true
                        };
                        if should_replace {
                            ops_map.insert(key, OpPlayer {
                                uuid,
                                name: trimmed.to_string(),
                                level,
                                bypasses_player_limit,
                            });
                        }
                    }
                }
            }
        }
    }
    let ops: Vec<OpPlayer> = ops_map.into_values().collect();

    let mut banned_players_map: std::collections::BTreeMap<String, BannedPlayer> = std::collections::BTreeMap::new();
    let bp_path = sdir.join("banned-players.json");
    if bp_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&bp_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let uuid = item.get("uuid").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let created = item.get("created").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let source = item.get("source").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let expires = item.get("expires").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let reason = item.get("reason").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let trimmed = name.trim();
                    if !trimmed.is_empty() {
                        let key = trimmed.to_lowercase();
                        banned_players_map.insert(key, BannedPlayer {
                            uuid,
                            name: trimmed.to_string(),
                            created,
                            source,
                            expires,
                            reason,
                        });
                    }
                }
            }
        }
    }
    let banned_players: Vec<BannedPlayer> = banned_players_map.into_values().collect();

    let mut banned_ips_map: std::collections::BTreeMap<String, BannedIp> = std::collections::BTreeMap::new();
    let bip_path = sdir.join("banned-ips.json");
    if bip_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&bip_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    let ip = item.get("ip").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let created = item.get("created").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let source = item.get("source").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let expires = item.get("expires").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let reason = item.get("reason").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let trimmed = ip.trim();
                    if !trimmed.is_empty() {
                        let key = trimmed.to_string();
                        banned_ips_map.insert(key, BannedIp {
                            ip: trimmed.to_string(),
                            created,
                            source,
                            expires,
                            reason,
                        });
                    }
                }
            }
        }
    }
    let banned_ips: Vec<BannedIp> = banned_ips_map.into_values().collect();

    let mut whitelist_enabled = false;
    let prop_path = sdir.join("server.properties");
    if prop_path.exists() {
        if let Ok(props) = std::fs::read_to_string(&prop_path) {
            for line in props.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("white-list=") || trimmed.starts_with("enforce-whitelist=") {
                    if let Some((_, val)) = trimmed.split_once('=') {
                        if val.trim().eq_ignore_ascii_case("true") {
                            whitelist_enabled = true;
                        }
                    }
                }
            }
        }
    }

    // Collect all historical & connected players
    let mut known_players_map: std::collections::BTreeMap<String, (String, Option<String>, Option<String>)> = std::collections::BTreeMap::new();

    let usercache_path = sdir.join("usercache.json");
    if usercache_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&usercache_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                for item in parsed {
                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                    let uuid = item.get("uuid").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let expires = item.get("expiresOn").and_then(|v| v.as_str()).map(|s| s.to_string());
                    if !name.is_empty() {
                        known_players_map.insert(name.to_lowercase(), (name, uuid, expires));
                    }
                }
            }
        }
    }

    let status = state.lifecycle.get_status(&server_id, server.port);
    let is_server_running = status.state == ServerStatusState::Running;

    // Track online players from logs if server is running
    let mut online_players: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    if is_server_running {
        let logs = state.lifecycle.get_logs(&server_id);
        for line in logs {
            if line.contains(" joined the game") {
                if let Some(idx) = line.find("]: ") {
                    let rest = &line[idx + 3..];
                    if let Some(name) = rest.strip_suffix(" joined the game") {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() {
                            online_players.insert(trimmed.to_string());
                        }
                    }
                }
            } else if line.contains(" left the game") {
                if let Some(idx) = line.find("]: ") {
                    let rest = &line[idx + 3..];
                    if let Some(name) = rest.strip_suffix(" left the game") {
                        let trimmed = name.trim();
                        online_players.remove(trimmed);
                    }
                }
            } else if line.contains(" lost connection") {
                if let Some(idx) = line.find("]: ") {
                    let rest = &line[idx + 3..];
                    if let Some((name, _)) = rest.split_once(" lost connection") {
                        online_players.remove(name.trim());
                    }
                }
            }
        }
    }

    for on in &online_players {
        if !known_players_map.contains_key(&on.to_lowercase()) {
            known_players_map.insert(on.to_lowercase(), (on.clone(), None, None));
        }
    }

    for w in &whitelist {
        if !known_players_map.contains_key(&w.name.to_lowercase()) {
            known_players_map.insert(w.name.to_lowercase(), (w.name.clone(), w.uuid.clone(), None));
        }
    }
    for op in &ops {
        if !known_players_map.contains_key(&op.name.to_lowercase()) {
            known_players_map.insert(op.name.to_lowercase(), (op.name.clone(), op.uuid.clone(), None));
        }
    }
    for b in &banned_players {
        if !known_players_map.contains_key(&b.name.to_lowercase()) {
            known_players_map.insert(b.name.to_lowercase(), (b.name.clone(), b.uuid.clone(), None));
        }
    }

    let mut players: Vec<crate::models::KnownPlayer> = Vec::new();
    for (_, (name, uuid, expires)) in known_players_map {
        let is_online = online_players.iter().any(|on| on.eq_ignore_ascii_case(&name));
        let op_info = ops.iter().find(|o| o.name.eq_ignore_ascii_case(&name));
        let is_op = op_info.is_some();
        let op_level = op_info.and_then(|o| o.level);
        let is_whitelisted = whitelist.iter().any(|w| w.name.eq_ignore_ascii_case(&name));
        let ban_info = banned_players.iter().find(|b| b.name.eq_ignore_ascii_case(&name));
        let is_banned = ban_info.is_some();
        let ban_reason = ban_info.and_then(|b| b.reason.clone());

        players.push(crate::models::KnownPlayer {
            name,
            uuid,
            is_online,
            is_op,
            op_level,
            is_whitelisted,
            is_banned,
            ban_reason,
            last_seen: expires,
        });
    }

    // Sort: Online players first, then alphabetically
    players.sort_by(|a, b| {
        match (a.is_online, b.is_online) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(ServerPlayerData {
        players,
        whitelist,
        ops,
        banned_players,
        banned_ips,
        whitelist_enabled,
        is_server_running,
    })
}

#[tauri::command]
pub async fn toggle_server_whitelist(
    state: State<'_, AppState>,
    server_id: String,
    enabled: bool,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let prop_path = std::path::PathBuf::from(&server.server_dir).join("server.properties");
    if prop_path.exists() {
        let content = std::fs::read_to_string(&prop_path).unwrap_or_default();
        let mut new_lines = Vec::new();
        let mut found = false;
        for line in content.lines() {
            if line.trim().starts_with("white-list=") {
                new_lines.push(format!("white-list={}", enabled));
                found = true;
            } else {
                new_lines.push(line.to_string());
            }
        }
        if !found {
            new_lines.push(format!("white-list={}", enabled));
        }
        let _ = std::fs::write(&prop_path, new_lines.join("
"));
    }

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let cmd = if enabled { "whitelist on" } else { "whitelist off" };
        let _ = state.lifecycle.send_command(&server_id, cmd);
        let _ = state.lifecycle.send_command(&server_id, "whitelist reload");
    }

    Ok(true)
}

#[tauri::command]
pub async fn add_server_whitelist(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    if clean_name.is_empty() {
        return Err("Player name cannot be empty".to_string());
    }

    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("whitelist.json");
    let mut list: Vec<serde_json::Value> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let resolved_uuid = find_cached_player_uuid(&sdir, clean_name)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    list.retain(|item| {
        !item.get("name")
            .and_then(|n| n.as_str())
            .map(|n| n.eq_ignore_ascii_case(clean_name))
            .unwrap_or(false)
    });

    list.push(json!({
        "name": clean_name,
        "uuid": resolved_uuid
    }));
    let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let _ = state.lifecycle.send_command(&server_id, &format!("whitelist add {}", clean_name));
        let _ = state.lifecycle.send_command(&server_id, "whitelist reload");
    }

    Ok(true)
}

#[tauri::command]
pub async fn remove_server_whitelist(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("whitelist.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                list.retain(|item| {
                    item.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| !n.eq_ignore_ascii_case(clean_name))
                        .unwrap_or(true)
                });
                let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());
            }
        }
    }

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let _ = state.lifecycle.send_command(&server_id, &format!("whitelist remove {}", clean_name));
        let _ = state.lifecycle.send_command(&server_id, "whitelist reload");
    }

    Ok(true)
}

#[tauri::command]
pub async fn add_server_op(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
    level: Option<u8>,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    if clean_name.is_empty() {
        return Err("Player name cannot be empty".to_string());
    }

    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("ops.json");
    let mut list: Vec<serde_json::Value> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let resolved_uuid = find_cached_player_uuid(&sdir, clean_name)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    list.retain(|item| {
        !item.get("name")
            .and_then(|n| n.as_str())
            .map(|n| n.eq_ignore_ascii_case(clean_name))
            .unwrap_or(false)
    });

    list.push(json!({
        "name": clean_name,
        "uuid": resolved_uuid,
        "level": level.unwrap_or(4),
        "bypassesPlayerLimit": false
    }));
    let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let _ = state.lifecycle.send_command(&server_id, &format!("op {}", clean_name));
    }

    Ok(true)
}

#[tauri::command]
pub async fn remove_server_op(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("ops.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                list.retain(|item| {
                    item.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| !n.eq_ignore_ascii_case(clean_name))
                        .unwrap_or(true)
                });
                let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());
            }
        }
    }

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let _ = state.lifecycle.send_command(&server_id, &format!("deop {}", clean_name));
    }

    Ok(true)
}

#[tauri::command]
pub async fn ban_server_player(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
    reason: Option<String>,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    if clean_name.is_empty() {
        return Err("Player name cannot be empty".to_string());
    }

    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("banned-players.json");
    let mut list: Vec<serde_json::Value> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let resolved_uuid = find_cached_player_uuid(&sdir, clean_name)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    list.retain(|item| {
        !item.get("name")
            .and_then(|n| n.as_str())
            .map(|n| n.eq_ignore_ascii_case(clean_name))
            .unwrap_or(false)
    });

    list.push(json!({
        "name": clean_name,
        "uuid": resolved_uuid,
        "created": chrono::Utc::now().to_rfc3339(),
        "source": "Server Admin",
        "expires": "forever",
        "reason": reason.clone().unwrap_or_else(|| "Banned by an operator.".to_string())
    }));
    let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let reason_arg = reason.as_deref().unwrap_or("Banned by operator");
        let _ = state.lifecycle.send_command(&server_id, &format!("ban {} {}", clean_name, reason_arg));
    }

    Ok(true)
}

#[tauri::command]
pub async fn unban_server_player(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let path = sdir.join("banned-players.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(mut list) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                list.retain(|item| {
                    item.get("name")
                        .and_then(|n| n.as_str())
                        .map(|n| !n.eq_ignore_ascii_case(clean_name))
                        .unwrap_or(true)
                });
                let _ = std::fs::write(&path, serde_json::to_string_pretty(&list).unwrap_or_default());
            }
        }
    }

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running {
        let _ = state.lifecycle.send_command(&server_id, &format!("pardon {}", clean_name));
    }

    Ok(true)
}

#[tauri::command]
pub async fn kick_server_player(
    state: State<'_, AppState>,
    server_id: String,
    player_name: String,
    reason: Option<String>,
) -> Result<bool, String> {
    let clean_name = player_name.trim();
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;
    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state != ServerStatusState::Running {
        return Err("Server must be running to kick a player".to_string());
    }

    let reason_arg = reason.as_deref().unwrap_or("Kicked by operator");
    state
        .lifecycle
        .send_command(&server_id, &format!("kick {} {}", clean_name, reason_arg))
        .map_err(|e| e.to_string())?;

    Ok(true)
}

// ==========================================
// NEW: WORLD & DIMENSION MANAGEMENT
// ==========================================

#[tauri::command]
pub async fn get_world_info(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<WorldDetails, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    
    let mut level_name = "world".to_string();
    let prop_path = sdir.join("server.properties");
    if prop_path.exists() {
        if let Ok(props) = std::fs::read_to_string(&prop_path) {
            for line in props.lines() {
                if let Some((k, v)) = line.trim().split_once('=') {
                    if k.trim() == "level-name" && !v.trim().is_empty() {
                        level_name = v.trim().to_string();
                    }
                }
            }
        }
    }

    let world_dir = sdir.join(&level_name);
    let nether_dir = if world_dir.join("DIM-1").exists() {
        world_dir.join("DIM-1")
    } else {
        sdir.join(format!("{}_nether", level_name)).join("DIM-1")
    };

    let end_dir = if world_dir.join("DIM1").exists() {
        world_dir.join("DIM1")
    } else {
        sdir.join(format!("{}_the_end", level_name)).join("DIM1")
    };

    fn dir_size_mb(path: &std::path::Path) -> f64 {
        if !path.exists() {
            return 0.0;
        }
        let total_bytes: u64 = walkdir::WalkDir::new(path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter_map(|e| e.metadata().ok())
            .filter(|m| m.is_file())
            .map(|m| m.len())
            .sum();
        ((total_bytes as f64) / (1024.0 * 1024.0) * 100.0).round() / 100.0
    }

    let total_size_mb = dir_size_mb(&world_dir)
        + if nether_dir.starts_with(&world_dir) { 0.0 } else { dir_size_mb(&nether_dir) }
        + if end_dir.starts_with(&world_dir) { 0.0 } else { dir_size_mb(&end_dir) };

    let nether_size_mb = dir_size_mb(&nether_dir);
    let end_size_mb = dir_size_mb(&end_dir);
    let overworld_size_mb = (total_size_mb - nether_size_mb - end_size_mb).max(0.0);

    let status = state.lifecycle.get_status(&server_id, server.port);
    let is_server_running = status.state == ServerStatusState::Running || status.state == ServerStatusState::Starting;

    Ok(WorldDetails {
        level_name,
        level_seed: None,
        total_size_mb,
        overworld_size_mb,
        nether_size_mb,
        end_size_mb,
        nether_exists: nether_dir.exists(),
        end_exists: end_dir.exists(),
        is_server_running,
    })
}

#[tauri::command]
pub async fn reset_dimension(
    state: State<'_, AppState>,
    server_id: String,
    dimension: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running || status.state == ServerStatusState::Starting {
        return Err("Server must be completely stopped before resetting dimensions to prevent chunk file corruption".to_string());
    }

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let mut level_name = "world".to_string();
    let prop_path = sdir.join("server.properties");
    if prop_path.exists() {
        if let Ok(props) = std::fs::read_to_string(&prop_path) {
            for line in props.lines() {
                if let Some((k, v)) = line.trim().split_once('=') {
                    if k.trim() == "level-name" && !v.trim().is_empty() {
                        level_name = v.trim().to_string();
                    }
                }
            }
        }
    }

    let world_dir = sdir.join(&level_name);

    match dimension.to_lowercase().as_str() {
        "all" | "world" => {
            if world_dir.exists() {
                std::fs::remove_dir_all(&world_dir)
                    .map_err(|e| format!("Failed to delete entire world folder: {}", e))?;
            }
            let spigot_nether = sdir.join(format!("{}_nether", level_name));
            if spigot_nether.exists() {
                std::fs::remove_dir_all(&spigot_nether)
                    .map_err(|e| format!("Failed to delete Spigot Nether: {}", e))?;
            }
            let spigot_end = sdir.join(format!("{}_the_end", level_name));
            if spigot_end.exists() {
                std::fs::remove_dir_all(&spigot_end)
                    .map_err(|e| format!("Failed to delete Spigot End: {}", e))?;
            }
        }
        "nether" => {
            let dim1_standard = world_dir.join("DIM-1");
            if dim1_standard.exists() {
                std::fs::remove_dir_all(&dim1_standard)
                    .map_err(|e| format!("Failed to delete standard Nether DIM-1: {}", e))?;
            }
            let spigot_nether = sdir.join(format!("{}_nether", level_name));
            if spigot_nether.exists() {
                std::fs::remove_dir_all(&spigot_nether)
                    .map_err(|e| format!("Failed to delete Spigot Nether: {}", e))?;
            }
        }
        "end" => {
            let end_standard = world_dir.join("DIM1");
            if end_standard.exists() {
                std::fs::remove_dir_all(&end_standard)
                    .map_err(|e| format!("Failed to delete standard End DIM1: {}", e))?;
            }
            let spigot_end = sdir.join(format!("{}_the_end", level_name));
            if spigot_end.exists() {
                std::fs::remove_dir_all(&spigot_end)
                    .map_err(|e| format!("Failed to delete Spigot End: {}", e))?;
            }
        }
        _ => return Err("Invalid dimension. Expected 'nether' or 'end'".to_string()),
    }

    Ok(true)
}

#[tauri::command]
pub async fn import_world_archive(
    state: State<'_, AppState>,
    server_id: String,
    source_zip_path: String,
    custom_world_name: Option<String>,
) -> Result<String, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let status = state.lifecycle.get_status(&server_id, server.port);
    if status.state == ServerStatusState::Running || status.state == ServerStatusState::Starting {
        return Err("Server must be stopped before importing a world archive".to_string());
    }

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let zip_file_path = std::path::PathBuf::from(&source_zip_path);
    if !zip_file_path.exists() {
        return Err("Source world zip file not found".to_string());
    }

    let target_name = custom_world_name
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            zip_file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("imported_world")
                .to_string()
        });

    let safe_folder_name = target_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect::<String>();

    let target_dir = sdir.join(&safe_folder_name);
    std::fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let file = std::fs::File::open(&zip_file_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip archive: {}", e))?;

    let mut prefix_to_strip = None;
    let first_root = {
        if let Ok(first) = archive.by_index(0) {
            let n = first.name().replace('\\', "/");
            n.split_once('/').map(|(r, _)| r.to_string())
        } else {
            None
        }
    };
    if let Some(ref root) = first_root {
        let test_level = format!("{}/level.dat", root);
        let count = archive.len();
        for i in 0..count {
            if let Ok(entry) = archive.by_index(i) {
                let n = entry.name().replace('\\', "/");
                if n == test_level {
                    prefix_to_strip = Some(format!("{}/", root));
                    break;
                }
            }
        }
    }

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().replace('\\', "/");
        
        let sub_path = if let Some(ref pfx) = prefix_to_strip {
            if let Some(stripped) = entry_name.strip_prefix(pfx) {
                stripped.to_string()
            } else {
                continue;
            }
        } else {
            entry_name
        };

        if sub_path.is_empty() || sub_path.contains("..") {
            continue;
        }

        let clean_sub = match crate::security::SecurityPolicy::normalize_relative_path(&sub_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        let out_path = target_dir.join(clean_sub);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).ok();
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            let mut out_file = std::fs::File::create(&out_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
        }
    }

    let prop_path = sdir.join("server.properties");
    if prop_path.exists() {
        let content = std::fs::read_to_string(&prop_path).unwrap_or_default();
        let mut lines: Vec<String> = Vec::new();
        let mut found = false;
        for line in content.lines() {
            if line.trim().starts_with("level-name=") {
                lines.push(format!("level-name={}", safe_folder_name));
                found = true;
            } else {
                lines.push(line.to_string());
            }
        }
        if !found {
            lines.push(format!("level-name={}", safe_folder_name));
        }
        let _ = std::fs::write(&prop_path, lines.join("
"));
    }

    Ok(safe_folder_name)
}

// ==========================================
// NEW: IN-APP FILE EXPLORER
// ==========================================

#[tauri::command]
pub async fn list_server_dir(
    state: State<'_, AppState>,
    server_id: String,
    relative_dir: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let target_dir = if let Some(rel) = relative_dir {
        let clean = rel.replace('\\', "/").trim_start_matches('/').to_string();
        if clean.contains("..") {
            return Err("Invalid path traversal".to_string());
        }
        sdir.join(clean)
    } else {
        sdir.clone()
    };

    if !target_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(&target_dir).map_err(|e| e.to_string())?;

    for entry in read_dir.filter_map(|e| e.ok()) {
        let meta = entry.metadata().ok();
        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ms = meta
            .as_ref()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let rel_path = path
            .strip_prefix(&sdir)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());

        let ext = if is_dir {
            None
        } else {
            path.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase())
        };

        entries.push(FileEntry {
            name,
            relative_path: rel_path,
            is_dir,
            size_bytes,
            modified_ms,
            extension: ext,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(entries)
}

#[tauri::command]
pub async fn read_text_file(
    state: State<'_, AppState>,
    server_id: String,
    relative_path: String,
) -> Result<String, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let file_path = crate::security::SecurityPolicy::resolve_server_relative_path(&sdir, &relative_path)
        .map_err(|e| e.to_string())?;
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    let metadata = std::fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if metadata.len() > 5 * 1024 * 1024 {
        return Err("File too large to open in text editor (max 5MB)".to_string());
    }

    std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn save_text_file(
    state: State<'_, AppState>,
    server_id: String,
    relative_path: String,
    content: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let file_path = crate::security::SecurityPolicy::resolve_server_relative_path(&sdir, &relative_path)
        .map_err(|e| e.to_string())?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::write(&file_path, content).map_err(|e| format!("Failed to save file: {}", e))?;
    Ok(true)
}

#[tauri::command]
pub async fn delete_server_path(
    state: State<'_, AppState>,
    server_id: String,
    relative_path: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let target = crate::security::SecurityPolicy::resolve_server_relative_path(&sdir, &relative_path)
        .map_err(|e| e.to_string())?;
    if !target.exists() {
        return Err("Target path does not exist".to_string());
    }

    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        std::fs::remove_file(&target).map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(true)
}

#[tauri::command]
pub async fn create_server_folder(
    state: State<'_, AppState>,
    server_id: String,
    relative_path: String,
) -> Result<bool, String> {
    let server = state
        .db
        .get_server(&server_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Server not found".to_string())?;

    let sdir = std::path::PathBuf::from(&server.server_dir);
    let target = crate::security::SecurityPolicy::validate_safe_relative_path(&sdir, &relative_path)
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&target).map_err(|e| format!("Failed to create folder: {}", e))?;
    Ok(true)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_cached_player_uuid() {
        let temp_dir = std::env::temp_dir().join(format!("mcset_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let cache_file = temp_dir.join("usercache.json");
        let sample = serde_json::json!([
            {"name": "Steve", "uuid": "069a79f4-44e9-4726-a5be-fca90e38aaf5", "expiresOn": "2030-01-01 00:00:00 +0000"},
            {"name": "Alex", "uuid": "ec561538-f3fd-461d-a0e3-bda88d7802cd", "expiresOn": "2030-01-01 00:00:00 +0000"}
        ]);
        std::fs::write(&cache_file, serde_json::to_string(&sample).unwrap()).unwrap();

        // Exact match
        assert_eq!(
            find_cached_player_uuid(&temp_dir, "Steve"),
            Some("069a79f4-44e9-4726-a5be-fca90e38aaf5".to_string())
        );

        // Case-insensitive match
        assert_eq!(
            find_cached_player_uuid(&temp_dir, "steve"),
            Some("069a79f4-44e9-4726-a5be-fca90e38aaf5".to_string())
        );

        // Not found
        assert_eq!(find_cached_player_uuid(&temp_dir, "Notch"), None);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_ops_deduplication_logic() {
        let mut list = vec![
            serde_json::json!({"uuid": "uuid-1", "name": "Steve", "level": 4, "bypassesPlayerLimit": false}),
            serde_json::json!({"uuid": "uuid-2", "name": "Alex", "level": 4, "bypassesPlayerLimit": false}),
            serde_json::json!({"uuid": "uuid-old", "name": "steve", "level": 2, "bypassesPlayerLimit": false}),
        ];

        let target_name = "STEVE";
        list.retain(|item| {
            !item.get("name")
                .and_then(|n| n.as_str())
                .map(|n| n.eq_ignore_ascii_case(target_name))
                .unwrap_or(false)
        });

        assert_eq!(list.len(), 1);
        assert_eq!(list[0]["name"], "Alex");

        list.push(serde_json::json!({
            "uuid": "uuid-fresh",
            "name": "Steve",
            "level": 4,
            "bypassesPlayerLimit": false
        }));

        assert_eq!(list.len(), 2);
    }
}
