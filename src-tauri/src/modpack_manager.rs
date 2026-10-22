use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use reqwest::Client;
use sha2::{Digest, Sha512};
use sha1::Sha1;
use tauri::{AppHandle, Emitter};
use crate::extension_manager::urlencoding;

use crate::models::{
    InstallModpackRequest, ModpackInstallProgress, ModpackProject, ModpackSearchResponse,
    ModpackVersionFile, ModpackVersionInfo, ModrinthIndex, ModrinthIndexFile,
    ServerProfile, ServerType,
};
use crate::security::SecurityPolicy;

#[derive(Clone)]
pub struct ModpackManager {
    data_dir: PathBuf,
    client: Client,
    active_installs: Arc<Mutex<HashSet<String>>>,
    cancelled_installs: Arc<Mutex<HashSet<String>>>,
    install_processes: Arc<Mutex<HashMap<String, u32>>>,
}

impl ModpackManager {
    pub fn new(data_dir: PathBuf) -> Self {
        let client = Client::builder()
            .user_agent("MCSet-ModpackManager/0.1.0 (antigravity; contact=support@mcset.app)")
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            data_dir,
            client,
            active_installs: Arc::new(Mutex::new(HashSet::new())),
            cancelled_installs: Arc::new(Mutex::new(HashSet::new())),
            install_processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Search modpacks across supported providers (Modrinth / CurseForge)
    pub async fn search_modpacks(
        &self,
        provider: &str,
        query: &str,
        minecraft_version: Option<&str>,
        loader: Option<&str>,
        offset: u32,
        limit: u32,
        curseforge_api_key: Option<&str>,
    ) -> Result<ModpackSearchResponse> {
        let prov = provider.to_lowercase();
        match prov.as_str() {
            "curseforge" => {
                self.search_curseforge(query, minecraft_version, loader, offset, limit, curseforge_api_key).await
            }
            _ => {
                self.search_modrinth(query, minecraft_version, loader, offset, limit).await
            }
        }
    }

    /// Search Modrinth modpacks using Modrinth v2 search API
    async fn search_modrinth(
        &self,
        query: &str,
        minecraft_version: Option<&str>,
        loader: Option<&str>,
        offset: u32,
        limit: u32,
    ) -> Result<ModpackSearchResponse> {
        let mut facet_list = vec![r#"["project_type:modpack"]"#.to_string()];

        if let Some(mc) = minecraft_version {
            if !mc.trim().is_empty() {
                facet_list.push(format!(r#"["versions:{}"]"#, mc.trim()));
            }
        }
        if let Some(ld) = loader {
            if !ld.trim().is_empty() {
                facet_list.push(format!(r#"["categories:{}"]"#, ld.trim().to_lowercase()));
            }
        }

        let facets_str = format!("[{}]", facet_list.join(","));
        let sort_index = if query.trim().is_empty() {
            "downloads"
        } else {
            "relevance"
        };
        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&index={}&offset={}&limit={}",
            urlencoding::encode(query.trim()),
            urlencoding::encode(&facets_str),
            sort_index,
            offset,
            limit.clamp(1, 100)
        );

        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Modrinth search returned HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await?;
        let hits_val = json.get("hits").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let total_hits = json.get("total_hits").and_then(|v| v.as_u64()).unwrap_or(0);

        let mut hits = Vec::new();
        for hit in hits_val {
            let id = hit.get("project_id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let slug = hit.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = hit.get("title").and_then(|v| v.as_str()).unwrap_or(&slug).to_string();
            let description = hit.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let author = hit.get("author").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string();
            let icon_url = hit.get("icon_url").and_then(|v| v.as_str()).map(|s| s.to_string());
            let downloads = hit.get("downloads").and_then(|v| v.as_u64()).unwrap_or(0);
            let follows = hit.get("follows").and_then(|v| v.as_u64()).unwrap_or(0);

            let categories: Vec<String> = hit.get("categories")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let loaders: Vec<String> = categories
                .iter()
                .filter(|c| ["fabric", "forge", "neoforge", "quilt"].contains(&c.as_str()))
                .cloned()
                .collect();

            let game_versions: Vec<String> = hit.get("versions")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let latest_version = hit.get("latest_version").and_then(|v| v.as_str()).map(|s| s.to_string());

            hits.push(ModpackProject {
                id,
                slug,
                title,
                description,
                author,
                icon_url,
                downloads,
                follows,
                categories,
                loaders,
                game_versions,
                latest_version,
                provider: "modrinth".to_string(),
            });
        }

        Ok(ModpackSearchResponse {
            hits,
            total_hits,
            offset,
            limit,
            provider: "modrinth".to_string(),
        })
    }

    /// Search CurseForge modpacks with API key handling and clear guidance
    async fn search_curseforge(
        &self,
        query: &str,
        _minecraft_version: Option<&str>,
        _loader: Option<&str>,
        offset: u32,
        limit: u32,
        api_key: Option<&str>,
    ) -> Result<ModpackSearchResponse> {
        let key = api_key.or(option_env!("CURSEFORGE_API_KEY"));
        let key = match key {
            Some(k) if !k.trim().is_empty() => k.trim(),
            _ => {
                return Err(anyhow!(
                    "CurseForge search requires an authorized API key due to CurseForge developer terms. \
                    Please supply your CurseForge API key in the installer, or import a downloaded CurseForge Server Pack directly using 'Upload ZIP'."
                ));
            }
        };

        let url = format!(
            "https://api.curseforge.com/v1/mods/search?gameId=432&classId=4471&searchFilter={}&index={}&pageSize={}",
            urlencoding::encode(query),
            offset,
            limit.clamp(1, 50)
        );

        let resp = self.client.get(&url).header("x-api-key", key).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("CurseForge API returned HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await?;
        let data = json.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let total_hits = json.get("pagination").and_then(|p| p.get("totalCount")).and_then(|v| v.as_u64()).unwrap_or(data.len() as u64);

        let mut hits = Vec::new();
        for item in data {
            let id = item.get("id").map(|v| v.to_string()).unwrap_or_default();
            let slug = item.get("slug").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = item.get("name").and_then(|v| v.as_str()).unwrap_or(&slug).to_string();
            let description = item.get("summary").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let author = item.get("authors")
                .and_then(|a| a.as_array())
                .and_then(|a| a.first())
                .and_then(|x| x.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();

            let icon_url = item.get("logo").and_then(|l| l.get("url")).and_then(|v| v.as_str()).map(|s| s.to_string());
            let downloads = item.get("downloadCount").and_then(|v| v.as_u64()).unwrap_or(0);

            hits.push(ModpackProject {
                id,
                slug,
                title,
                description,
                author,
                icon_url,
                downloads,
                follows: 0,
                categories: vec!["modpack".to_string()],
                loaders: vec![],
                game_versions: vec![],
                latest_version: None,
                provider: "curseforge".to_string(),
            });
        }

        Ok(ModpackSearchResponse {
            hits,
            total_hits,
            offset,
            limit,
            provider: "curseforge".to_string(),
        })
    }

    /// Retrieve versions for a modpack project
    pub async fn get_modpack_versions(
        &self,
        provider: &str,
        project_id_or_slug: &str,
        curseforge_api_key: Option<&str>,
    ) -> Result<Vec<ModpackVersionInfo>> {
        if provider.eq_ignore_ascii_case("curseforge") {
            self.get_curseforge_versions(project_id_or_slug, curseforge_api_key).await
        } else {
            self.get_modrinth_versions(project_id_or_slug).await
        }
    }

    /// Retrieve versions for a Modrinth modpack project
    async fn get_modrinth_versions(&self, project_id_or_slug: &str) -> Result<Vec<ModpackVersionInfo>> {
        let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id_or_slug);
        let resp = self.client.get(&url).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("Failed to fetch Modrinth versions: HTTP {}", resp.status()));
        }

        let array: serde_json::Value = resp.json().await?;
        let items = array.as_array().ok_or_else(|| anyhow!("Expected array of versions from Modrinth"))?;

        let mut result = Vec::new();
        for item in items {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let version_number = item.get("version_number").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let date_published = item.get("date_published").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let changelog = item.get("changelog").and_then(|v| v.as_str()).map(|s| s.to_string());

            let game_versions = item.get("game_versions")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let loaders = item.get("loaders")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let raw_files = item.get("files").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut files = Vec::new();
            let mut primary_url = String::new();
            let mut primary_filename = String::new();
            let mut primary_size = 0u64;

            for f in raw_files {
                let file_url = f.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let filename = f.get("filename").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let primary = f.get("primary").and_then(|v| v.as_bool()).unwrap_or(false);
                let size = f.get("size").and_then(|v| v.as_u64()).unwrap_or(0);

                let mut hashes = HashMap::new();
                if let Some(h) = f.get("hashes").and_then(|v| v.as_object()) {
                    for (k, val) in h {
                        if let Some(s) = val.as_str() {
                            hashes.insert(k.clone(), s.to_string());
                        }
                    }
                }

                if filename.to_lowercase().contains("server") || (primary && primary_url.is_empty()) || primary_url.is_empty() {
                    primary_url = file_url.clone();
                    primary_filename = filename.clone();
                    primary_size = size;
                }

                files.push(ModpackVersionFile {
                    url: file_url,
                    filename,
                    primary,
                    size,
                    hashes,
                });
            }

            result.push(ModpackVersionInfo {
                id,
                name,
                version_number,
                game_versions,
                loaders,
                date_published,
                download_url: primary_url,
                filename: primary_filename,
                file_size: primary_size,
                files,
                changelog,
                server_pack_available: Some(true),
            });
        }

        Ok(result)
    }

    /// Retrieve versions for a CurseForge modpack project
    async fn get_curseforge_versions(
        &self,
        project_id: &str,
        api_key: Option<&str>,
    ) -> Result<Vec<ModpackVersionInfo>> {
        let key = api_key.or(option_env!("CURSEFORGE_API_KEY"));
        let key = match key {
            Some(k) if !k.trim().is_empty() => k.trim(),
            _ => {
                return Err(anyhow!("CurseForge API key required to retrieve file versions."));
            }
        };

        let url = format!("https://api.curseforge.com/v1/mods/{}/files", project_id);
        let resp = self.client.get(&url).header("x-api-key", key).send().await?;
        if !resp.status().is_success() {
            return Err(anyhow!("CurseForge files returned HTTP {}", resp.status()));
        }

        let json: serde_json::Value = resp.json().await?;
        let data = json.get("data").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let mut result = Vec::new();
        for item in data {
            let id = item.get("id").map(|v| v.to_string()).unwrap_or_default();
            let mut name = item.get("displayName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut filename = item.get("fileName").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut download_url = item.get("downloadUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let mut file_size = item.get("fileLength").and_then(|v| v.as_u64()).unwrap_or(0);
            let date_published = item.get("fileDate").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let server_pack_id = item.get("serverPackFileId").and_then(|v| v.as_u64());
            let server_pack_available = server_pack_id.is_some();

            // When an official dedicated server pack is available, fetch its direct details
            if let Some(sp_id) = server_pack_id {
                let sp_url = format!("https://api.curseforge.com/v1/mods/{}/files/{}", project_id, sp_id);
                if let Ok(sp_resp) = self.client.get(&sp_url).header("x-api-key", key).send().await {
                    if sp_resp.status().is_success() {
                        if let Ok(sp_json) = sp_resp.json::<serde_json::Value>().await {
                            if let Some(sp_data) = sp_json.get("data") {
                                if let Some(sp_dl) = sp_data.get("downloadUrl").and_then(|v| v.as_str()) {
                                    download_url = sp_dl.to_string();
                                }
                                if let Some(sp_fn) = sp_data.get("fileName").and_then(|v| v.as_str()) {
                                    filename = sp_fn.to_string();
                                }
                                if let Some(sp_len) = sp_data.get("fileLength").and_then(|v| v.as_u64()) {
                                    file_size = sp_len;
                                }
                                name = format!("{} [Server Pack]", name);
                            }
                        }
                    }
                }
            }

            let game_versions = item.get("gameVersions")
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            result.push(ModpackVersionInfo {
                id,
                name: name.clone(),
                version_number: name,
                game_versions,
                loaders: vec![],
                date_published,
                download_url,
                filename,
                file_size,
                files: vec![],
                changelog: None,
                server_pack_available: Some(server_pack_available),
            });
        }

        Ok(result)
    }

    /// Cancel an in-progress modpack installation and terminate worker subprocess immediately
    pub fn cancel_install(&self, install_id: &str) {
        let mut cancelled = self.cancelled_installs.lock().unwrap();
        cancelled.insert(install_id.to_string());

        if let Ok(mut procs) = self.install_processes.lock() {
            if let Some(pid) = procs.remove(install_id) {
                #[cfg(windows)]
                {
                    let _ = Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &pid.to_string()])
                        .status();
                }
                #[cfg(not(windows))]
                {
                    let _ = Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .status();
                }
            }
        }
    }

    /// Check if an installation was cancelled
    fn is_cancelled(&self, install_id: &str) -> bool {
        let cancelled = self.cancelled_installs.lock().unwrap();
        cancelled.contains(install_id)
    }

    /// Emit install progress to Tauri frontend
    fn emit_progress(&self, app: &AppHandle, progress: ModpackInstallProgress) {
        let _ = app.emit("modpack-install-progress", &progress);
        let _ = app.emit(&format!("modpack-install-progress:{}", progress.install_id), &progress);
    }

    /// Locates the mrpack-install binary, checking standard locations or downloading release if missing
    pub async fn ensure_mrpack_install_binary(&self) -> Result<PathBuf> {
        let candidates = [
            self.data_dir.join("bin").join("mrpack-install.exe"),
            PathBuf::from("mrpack-install.exe"),
            PathBuf::from("C:\\Users\\hanis\\AppData\\Roaming\\mcset\\bin\\mrpack-install.exe"),
        ];

        for candidate in &candidates {
            if candidate.is_file() {
                let target_bin = self.data_dir.join("bin").join("mrpack-install.exe");
                if candidate != &target_bin && !target_bin.is_file() {
                    let _ = std::fs::create_dir_all(self.data_dir.join("bin"));
                    let _ = std::fs::copy(candidate, &target_bin);
                }
                return Ok(candidate.clone());
            }
        }

        if let Ok(curr) = std::env::current_exe() {
            if let Some(parent) = curr.parent() {
                let p = parent.join("mrpack-install.exe");
                if p.is_file() {
                    return Ok(p);
                }
            }
        }

        // If not found locally, download official release from GitHub
        let bin_dir = self.data_dir.join("bin");
        std::fs::create_dir_all(&bin_dir)?;
        let target_exe = bin_dir.join("mrpack-install.exe");

        let download_url = "https://github.com/nothub/mrpack-install/releases/download/v0.16.10/mrpack-install-windows.exe";
        let resp = self.client.get(download_url).send().await
            .map_err(|e| anyhow!("Failed to download mrpack-install: {}", e))?;
        if !resp.status().is_success() {
            return Err(anyhow!("mrpack-install download failed with HTTP {}", resp.status()));
        }
        let bytes = resp.bytes().await?;
        std::fs::write(&target_exe, &bytes)?;
        Ok(target_exe)
    }

    /// Parse flavor dependencies line from mrpack-install output
    /// Example: "Flavor dependencies: {Minecraft:1.21.1 Fabric:0.19.5 Quilt: Forge:}"
    pub fn parse_flavor_dependencies(line: &str) -> (Option<String>, Option<ServerType>, Option<String>) {
        let mut mc = None;
        let mut server_type = None;
        let mut loader_ver = None;

        for token in line.split_whitespace() {
            let clean = token.trim_matches(|c| c == '{' || c == '}' || c == ',' || c == '"');
            if let Some((k, v)) = clean.split_once(':') {
                let v = v.trim();
                if !v.is_empty() {
                    match k.to_lowercase().as_str() {
                        "minecraft" => mc = Some(v.to_string()),
                        "fabric" => {
                            server_type = Some(ServerType::Fabric);
                            loader_ver = Some(v.to_string());
                        }
                        "forge" => {
                            server_type = Some(ServerType::Forge);
                            loader_ver = Some(v.to_string());
                        }
                        "neoforge" => {
                            server_type = Some(ServerType::NeoForge);
                            loader_ver = Some(v.to_string());
                        }
                        "quilt" => {
                            server_type = Some(ServerType::Quilt);
                            loader_ver = Some(v.to_string());
                        }
                        _ => {}
                    }
                }
            }
        }

        (mc, server_type, loader_ver)
    }

    /// Parse dependency count from mrpack-install output
    pub fn parse_dependency_count(line: &str) -> Option<u32> {
        if line.contains("Downloading ") && line.contains(" dependencies...") {
            if let Some(start) = line.find("Downloading ") {
                if let Some(end) = line.find(" dependencies...") {
                    let num_str = line[start + "Downloading ".len()..end].trim();
                    return num_str.parse::<u32>().ok();
                }
            }
        }
        None
    }

    /// Parse downloaded file name from mrpack-install output
    pub fn parse_downloaded_file(line: &str) -> Option<String> {
        if line.starts_with("Downloaded:") {
            let path_str = line["Downloaded:".len()..].trim();
            let file_name = Path::new(path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.to_string());
            return Some(file_name);
        }
        None
    }

    /// Parse server jar filename from mrpack-install output
    pub fn parse_server_jar(line: &str) -> Option<String> {
        if line.starts_with("Server jar downloaded to:") {
            let path_str = line["Server jar downloaded to:".len()..].trim();
            let file_name = Path::new(path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.to_string());
            return Some(file_name);
        }
        None
    }

    /// Execute mrpack-install worker process and stream progress
    pub async fn install_with_mrpack_install(
        &self,
        app: &AppHandle,
        req: &InstallModpackRequest,
        server_dir: &Path,
    ) -> Result<(String, ServerType, String, String)> {
        let install_id = req.install_id.clone();
        let mrpack_bin = self.ensure_mrpack_install_binary().await?;

        let emit = |step: &str, percent: f32, details: &str, cur_file: Option<&str>, completed: u32, total: u32| {
            self.emit_progress(app, ModpackInstallProgress {
                install_id: install_id.clone(),
                step: step.to_string(),
                progress_percent: percent,
                details: details.to_string(),
                current_file: cur_file.map(|s| s.to_string()),
                files_completed: completed,
                total_files: total,
                bytes_downloaded: 0,
                total_bytes: 0,
            });
        };

        emit("Preparing installer", 5.0, "Launching mrpack-install worker engine...", None, 0, 0);

        if self.is_cancelled(&install_id) {
            return Err(anyhow!("Modpack installation cancelled by user"));
        }

        let mut cmd = Command::new(&mrpack_bin);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        // Determine input argument: local file -> URL -> slug/version
        if let Some(ref local_path) = req.local_archive_path {
            cmd.arg(local_path);
        } else if !req.download_url.is_empty() {
            cmd.arg(&req.download_url);
        } else if !req.project_id.is_empty() {
            cmd.arg(&req.project_id);
            if !req.version_id.is_empty() {
                cmd.arg(&req.version_id);
            }
        } else {
            return Err(anyhow!("No valid modpack source provided (missing URL, project ID, or local file)"));
        }

        cmd.args([
            "--server-dir",
            &server_dir.to_string_lossy(),
            "--download-threads",
            "8",
            "--retry-times",
            "3",
        ]);

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = cmd.spawn()
            .map_err(|e| anyhow!("Failed to spawn mrpack-install at {:?}: {}", mrpack_bin, e))?;

        let pid = child.id();
        {
            let mut procs = self.install_processes.lock().unwrap();
            procs.insert(install_id.clone(), pid);
        }

        let stdout = child.stdout.take()
            .ok_or_else(|| anyhow!("Failed to capture stdout from mrpack-install"))?;
        let stderr = child.stderr.take()
            .ok_or_else(|| anyhow!("Failed to capture stderr from mrpack-install"))?;

        let stderr_handle = std::thread::spawn(move || {
            let mut err_str = String::new();
            let mut reader = BufReader::new(stderr);
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 { break; }
                err_str.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
            err_str
        });

        let mut detected_mc = "1.20.1".to_string();
        let mut detected_type = ServerType::Fabric;
        let mut detected_loader_ver = String::new();
        let mut detected_jar = String::new();
        let mut total_deps = 0u32;
        let mut completed_deps = 0u32;

        let reader = BufReader::new(stdout);
        for line_res in reader.lines() {
            if self.is_cancelled(&install_id) {
                #[cfg(windows)]
                {
                    let _ = Command::new("taskkill").args(["/F", "/T", "/PID", &pid.to_string()]).status();
                }
                #[cfg(not(windows))]
                {
                    let _ = Command::new("kill").args(["-9", &pid.to_string()]).status();
                }
                let _ = child.kill();
                return Err(anyhow!("Modpack installation cancelled by user"));
            }

            let line = line_res.unwrap_or_default();
            log::info!("[mrpack-install] {}", line);

            if line.contains("Downloading mrpack file from") {
                emit("Downloading modpack archive", 10.0, "Downloading .mrpack archive...", None, 0, 0);
            } else if line.contains("Processing mrpack file") {
                emit("Validating archive", 20.0, "Extracting and verifying modpack index...", None, 0, 0);
            } else if line.contains("Flavor dependencies:") {
                let (mc, s_type, l_ver) = Self::parse_flavor_dependencies(&line);
                if let Some(m) = mc {
                    detected_mc = m;
                }
                if let Some(st) = s_type {
                    detected_type = st;
                }
                if let Some(lv) = l_ver {
                    detected_loader_ver = lv;
                }
                emit("Resolving loader", 28.0, &format!("Detected {} {:?}", detected_mc, detected_type), None, 0, 0);
            } else if let Some(jar) = Self::parse_server_jar(&line) {
                detected_jar = jar;
                emit("Server loader ready", 34.0, "Dedicated loader jar downloaded", None, 0, 0);
            } else if let Some(count) = Self::parse_dependency_count(&line) {
                total_deps = count;
                emit("Downloading dependencies", 38.0, &format!("Downloading {} dependencies...", total_deps), None, 0, total_deps);
            } else if let Some(filename) = Self::parse_downloaded_file(&line) {
                completed_deps += 1;
                let pct = 38.0 + (completed_deps as f32 / total_deps.max(1) as f32) * 44.0;
                emit("Downloading dependencies", pct.min(84.0), &format!("Fetched {}", filename), Some(&filename), completed_deps, total_deps);
            } else if line.contains("Extracting overrides...") {
                emit("Applying overrides", 86.0, "Extracting server overrides and configuration...", None, completed_deps, total_deps);
            } else if line.starts_with("Override file extracted:") {
                let path_str = line["Override file extracted:".len()..].trim();
                let file_name = Path::new(path_str).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| path_str.to_string());
                emit("Applying overrides", 89.0, &format!("Applied {}", file_name), Some(&file_name), completed_deps, total_deps);
            }
        }

        let status = child.wait()
            .map_err(|e| anyhow!("Failed waiting for mrpack-install: {}", e))?;

        {
            let mut procs = self.install_processes.lock().unwrap();
            procs.remove(&install_id);
        }

        if self.is_cancelled(&install_id) {
            return Err(anyhow!("Modpack installation cancelled by user"));
        }

        if !status.success() {
            let err_log = stderr_handle.join().unwrap_or_default();
            return Err(anyhow!("mrpack-install failed with exit code {:?}: {}", status.code(), err_log));
        }

        // Determine final launcher or jar file in server_dir
        if server_dir.join("run.bat").exists() {
            detected_jar = "run.bat".to_string();
        } else if server_dir.join("start.bat").exists() {
            detected_jar = "start.bat".to_string();
        } else if server_dir.join("run.sh").exists() {
            detected_jar = "run.sh".to_string();
        } else if detected_jar.is_empty() || !server_dir.join(&detected_jar).exists() {
            if let Ok(entries) = std::fs::read_dir(server_dir) {
                for entry in entries.filter_map(Result::ok) {
                    let n = entry.file_name().to_string_lossy().to_string();
                    if n.ends_with(".jar") && (n.contains("fabric-server") || n.contains("quilt-server") || n.contains("forge") || n.contains("neoforge") || n.contains("server")) {
                        detected_jar = n;
                        break;
                    }
                }
            }
            if detected_jar.is_empty() {
                detected_jar = "server.jar".to_string();
            }
        }

        Ok((detected_mc, detected_type, detected_loader_ver, detected_jar))
    }

    /// Parse and validate `modrinth.index.json`
    pub fn parse_modrinth_index(bytes: &[u8]) -> Result<ModrinthIndex> {
        let index: ModrinthIndex = serde_json::from_slice(bytes)
            .map_err(|e| anyhow!("Failed to parse modrinth.index.json: {}", e))?;

        if index.format_version != 1 {
            return Err(anyhow!("Unsupported Modrinth index format version: {}", index.format_version));
        }
        if index.game != "minecraft" {
            return Err(anyhow!("Unsupported modpack game: '{}', expected 'minecraft'", index.game));
        }

        Ok(index)
    }

    /// Filter files for dedicated server: excludes `env.server == "unsupported"`
    pub fn filter_server_files(files: &[ModrinthIndexFile]) -> Vec<ModrinthIndexFile> {
        files
            .iter()
            .filter(|f| {
                if let Some(ref env) = f.env {
                    if let Some(ref s) = env.server {
                        if s.eq_ignore_ascii_case("unsupported") {
                            return false;
                        }
                    }
                }
                true
            })
            .cloned()
            .collect()
    }

    /// Detect mod loader and version from Modrinth index dependencies
    pub fn detect_loader_and_versions(
        dependencies: &HashMap<String, String>,
    ) -> Result<(String, ServerType, String)> {
        let mc_version = dependencies
            .get("minecraft")
            .cloned()
            .ok_or_else(|| anyhow!("Modpack index missing required 'minecraft' dependency"))?;

        if let Some(loader_ver) = dependencies.get("fabric-loader") {
            return Ok((mc_version, ServerType::Fabric, loader_ver.clone()));
        }
        if let Some(loader_ver) = dependencies.get("neoforge") {
            return Ok((mc_version, ServerType::NeoForge, loader_ver.clone()));
        }
        if let Some(loader_ver) = dependencies.get("forge") {
            return Ok((mc_version, ServerType::Forge, loader_ver.clone()));
        }
        if let Some(loader_ver) = dependencies.get("quilt-loader") {
            return Ok((mc_version, ServerType::Quilt, loader_ver.clone()));
        }

        Ok((mc_version, ServerType::Vanilla, String::new()))
    }

    /// Verify SHA-512 or SHA-1 hash of a file
    pub fn verify_file_hash(data: &[u8], hashes: &HashMap<String, String>) -> Result<()> {
        if let Some(expected_sha512) = hashes.get("sha512") {
            let mut hasher = Sha512::new();
            hasher.update(data);
            let calculated = hex::encode(hasher.finalize());
            if !calculated.eq_ignore_ascii_case(expected_sha512) {
                return Err(anyhow!(
                    "SHA-512 hash mismatch: expected {}, calculated {}",
                    expected_sha512,
                    calculated
                ));
            }
            return Ok(());
        }

        if let Some(expected_sha1) = hashes.get("sha1") {
            let mut hasher = Sha1::new();
            hasher.update(data);
            let calculated = hex::encode(hasher.finalize());
            if !calculated.eq_ignore_ascii_case(expected_sha1) {
                return Err(anyhow!(
                    "SHA-1 hash mismatch: expected {}, calculated {}",
                    expected_sha1,
                    calculated
                ));
            }
            return Ok(());
        }

        // If no hashes declared, pass with warning
        Ok(())
    }

    /// Download a declared file with hash verification and domain security checks
    pub async fn download_and_verify_file(
        &self,
        downloads: &[String],
        hashes: &HashMap<String, String>,
        target_path: &Path,
    ) -> Result<()> {
        if downloads.is_empty() {
            return Err(anyhow!("No download URLs provided for file {:?}", target_path));
        }

        let mut last_err = anyhow!("Download failed");
        for url in downloads {
            // Verify domain policy
            if let Err(e) = SecurityPolicy::validate_download_url(url) {
                log::warn!("Skipping unauthorized download host for {}: {}", url, e);
                last_err = e;
                continue;
            }

            match self.client.get(url).send().await {
                Ok(resp) => {
                    if !resp.status().is_success() {
                        last_err = anyhow!("Download from {} failed with HTTP {}", url, resp.status());
                        continue;
                    }

                    match resp.bytes().await {
                        Ok(bytes) => {
                            if let Err(hash_err) = Self::verify_file_hash(&bytes, hashes) {
                                last_err = hash_err;
                                continue;
                            }

                            if let Some(parent) = target_path.parent() {
                                std::fs::create_dir_all(parent)?;
                            }
                            std::fs::write(target_path, &bytes)?;
                            return Ok(());
                        }
                        Err(e) => {
                            last_err = anyhow!("Failed reading body from {}: {}", url, e);
                        }
                    }
                }
                Err(e) => {
                    last_err = anyhow!("Connection to {} failed: {}", url, e);
                }
            }
        }

        Err(last_err)
    }

    /// Extract overrides and server-overrides in the correct order
    pub fn extract_overrides_from_zip(
        archive: &mut zip::ZipArchive<File>,
        server_dir: &Path,
    ) -> Result<()> {
        // Step 1: extract `overrides/`
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let raw_name = file.name().replace('\\', "/");

            if raw_name.starts_with("overrides/") && !raw_name.starts_with("server-overrides/") && !raw_name.starts_with("client-overrides/") {
                let rel = &raw_name["overrides/".len()..];
                if rel.is_empty() {
                    continue;
                }
                let target_path = SecurityPolicy::validate_safe_relative_path(server_dir, rel)?;
                if file.is_dir() {
                    std::fs::create_dir_all(&target_path)?;
                } else {
                    if let Some(p) = target_path.parent() {
                        std::fs::create_dir_all(p)?;
                    }
                    let mut out = File::create(&target_path)?;
                    std::io::copy(&mut file, &mut out)?;
                }
            }
        }

        // Step 2: extract `server-overrides/` on top of overrides
        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let raw_name = file.name().replace('\\', "/");

            if raw_name.starts_with("server-overrides/") {
                let rel = &raw_name["server-overrides/".len()..];
                if rel.is_empty() {
                    continue;
                }
                let target_path = SecurityPolicy::validate_safe_relative_path(server_dir, rel)?;
                if file.is_dir() {
                    std::fs::create_dir_all(&target_path)?;
                } else {
                    if let Some(p) = target_path.parent() {
                        std::fs::create_dir_all(p)?;
                    }
                    let mut out = File::create(&target_path)?;
                    std::io::copy(&mut file, &mut out)?;
                }
            }
        }

        Ok(())
    }

    /// Check if all entries in the zip share a single top-level directory prefix and return it
    pub fn detect_common_zip_root(archive: &mut zip::ZipArchive<File>) -> Option<String> {
        if archive.is_empty() {
            return None;
        }
        let first_name = match archive.by_index(0) {
            Ok(entry) => entry.name().replace('\\', "/"),
            Err(_) => return None,
        };
        let root = first_name.split('/').next()?.to_string();
        if root.is_empty() || !first_name.contains('/') {
            return None;
        }
        let prefix = format!("{}/", root);
        for i in 0..archive.len() {
            if let Ok(entry) = archive.by_index(i) {
                let name = entry.name().replace('\\', "/");
                if !name.starts_with(&prefix) && name != root {
                    return None;
                }
            }
        }
        Some(prefix)
    }

    /// Install dedicated server loader (Fabric, Quilt, Forge, or NeoForge)
    pub async fn install_loader(
        &self,
        server_dir: &Path,
        loader_type: &ServerType,
        minecraft_version: &str,
        loader_version: &str,
        java_binary: &str,
    ) -> Result<String> {
        match loader_type {
            ServerType::Fabric => {
                // Official Fabric server launcher URL:
                // https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader}/server/jar
                let url = format!(
                    "https://meta.fabricmc.net/v2/versions/loader/{}/{}/server/jar",
                    minecraft_version, loader_version
                );
                SecurityPolicy::validate_download_url(&url)?;

                let target_jar = "fabric-server-launch.jar";
                let target_path = server_dir.join(target_jar);

                let resp = self.client.get(&url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Failed downloading Fabric server launcher: HTTP {}", resp.status()));
                }
                let bytes = resp.bytes().await?;
                std::fs::write(&target_path, &bytes)?;
                Ok(target_jar.to_string())
            }

            ServerType::Quilt => {
                // Download Quilt installer and run server setup
                let installer_url = "https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/0.11.0/quilt-installer-0.11.0.jar";
                SecurityPolicy::validate_download_url(installer_url)?;

                let installer_path = server_dir.join("quilt-installer.jar");
                let resp = self.client.get(installer_url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Failed downloading Quilt installer: HTTP {}", resp.status()));
                }
                std::fs::write(&installer_path, resp.bytes().await?)?;

                let status = Command::new(java_binary)
                    .current_dir(server_dir)
                    .args([
                        "-jar",
                        "quilt-installer.jar",
                        "install",
                        "server",
                        minecraft_version,
                        loader_version,
                        "--download-server",
                    ])
                    .status()
                    .map_err(|e| anyhow!("Failed to execute Quilt installer: {}", e))?;

                let _ = std::fs::remove_file(&installer_path);

                if !status.success() {
                    return Err(anyhow!("Quilt installer finished with non-zero exit code: {:?}", status.code()));
                }

                Ok("quilt-server-launch.jar".to_string())
            }

            ServerType::Forge => {
                // Download Forge installer
                let installer_url = format!(
                    "https://maven.minecraftforge.net/net/minecraftforge/forge/{}-{}/forge-{}-{}-installer.jar",
                    minecraft_version, loader_version, minecraft_version, loader_version
                );
                SecurityPolicy::validate_download_url(&installer_url)?;

                let installer_path = server_dir.join("forge-installer.jar");
                let resp = self.client.get(&installer_url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Failed downloading Forge installer: HTTP {}", resp.status()));
                }
                std::fs::write(&installer_path, resp.bytes().await?)?;

                let status = Command::new(java_binary)
                    .current_dir(server_dir)
                    .args(["-jar", "forge-installer.jar", "--installServer"])
                    .status()
                    .map_err(|e| anyhow!("Failed to execute Forge installer: {}", e))?;

                let _ = std::fs::remove_file(&installer_path);

                if !status.success() {
                    return Err(anyhow!("Forge installer exited with code: {:?}", status.code()));
                }

                // Check for run.bat (modern Forge 1.17+) or legacy forge-*.jar
                if server_dir.join("run.bat").exists() {
                    Ok("run.bat".to_string())
                } else if server_dir.join("run.sh").exists() {
                    Ok("run.sh".to_string())
                } else {
                    // Look for forge-*.jar
                    for entry in std::fs::read_dir(server_dir)?.filter_map(Result::ok) {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with("forge-") && name.ends_with(".jar") {
                            return Ok(name);
                        }
                    }
                    Ok("server.jar".to_string())
                }
            }

            ServerType::NeoForge => {
                // Download NeoForge installer
                let installer_url = format!(
                    "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
                    loader_version, loader_version
                );
                SecurityPolicy::validate_download_url(&installer_url)?;

                let installer_path = server_dir.join("neoforge-installer.jar");
                let resp = self.client.get(&installer_url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Failed downloading NeoForge installer: HTTP {}", resp.status()));
                }
                std::fs::write(&installer_path, resp.bytes().await?)?;

                let status = Command::new(java_binary)
                    .current_dir(server_dir)
                    .args(["-jar", "neoforge-installer.jar", "--install-server"])
                    .status()
                    .map_err(|e| anyhow!("Failed to execute NeoForge installer: {}", e))?;

                let _ = std::fs::remove_file(&installer_path);

                if !status.success() {
                    return Err(anyhow!("NeoForge installer exited with code: {:?}", status.code()));
                }

                if server_dir.join("run.bat").exists() {
                    Ok("run.bat".to_string())
                } else if server_dir.join("run.sh").exists() {
                    Ok("run.sh".to_string())
                } else {
                    Ok("server.jar".to_string())
                }
            }

            _ => {
                // Vanilla
                Ok("server.jar".to_string())
            }
        }
    }

    /// Full step-by-step Modpack Server installation workflow
    pub async fn install_modpack_server(
        &self,
        app: AppHandle,
        req: InstallModpackRequest,
    ) -> Result<ServerProfile> {
        let install_id = req.install_id.clone();
        {
            let mut active = self.active_installs.lock().unwrap();
            active.insert(install_id.clone());
        }

        // Defer unregistration and cancellation cleanup
        let active_ref = self.active_installs.clone();
        let cancelled_ref = self.cancelled_installs.clone();
        let procs_ref = self.install_processes.clone();
        let install_id_cleanup = install_id.clone();

        struct InstallGuard {
            install_id: String,
            active: Arc<Mutex<HashSet<String>>>,
            cancelled: Arc<Mutex<HashSet<String>>>,
            procs: Arc<Mutex<HashMap<String, u32>>>,
        }
        impl Drop for InstallGuard {
            fn drop(&mut self) {
                let mut a = self.active.lock().unwrap();
                a.remove(&self.install_id);
                let mut c = self.cancelled.lock().unwrap();
                c.remove(&self.install_id);
                let mut p = self.procs.lock().unwrap();
                p.remove(&self.install_id);
            }
        }
        let _guard = InstallGuard {
            install_id: install_id_cleanup,
            active: active_ref,
            cancelled: cancelled_ref,
            procs: procs_ref,
        };

        // 1. Validate inputs
        SecurityPolicy::validate_server_name(&req.name)?;
        let min_ram = req.min_ram_mb.unwrap_or(2048);
        let max_ram = req.max_ram_mb.unwrap_or(4096);
        SecurityPolicy::validate_memory(min_ram, max_ram)?;

        let port = req.port.unwrap_or(25565);
        SecurityPolicy::validate_port(port)?;

        // Prepare server directory
        let server_id = uuid::Uuid::new_v4().to_string();
        let sanitized_name = req
            .name
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != '-', "_");

        let server_dir = if let Some(ref custom) = req.custom_dir {
            PathBuf::from(custom)
        } else {
            self.data_dir
                .join("servers")
                .join(format!("{}_{}", sanitized_name, &server_id[..8]))
        };

        std::fs::create_dir_all(&server_dir)?;
        let temp_dir = server_dir.join(".mcset_install_tmp");
        std::fs::create_dir_all(&temp_dir)?;

        // Helper closure to emit progress
        let emit = |step: &str, percent: f32, details: &str, cur_file: Option<&str>, completed: u32, total: u32, bytes_down: u64, total_bytes: u64| {
            self.emit_progress(&app, ModpackInstallProgress {
                install_id: install_id.clone(),
                step: step.to_string(),
                progress_percent: percent,
                details: details.to_string(),
                current_file: cur_file.map(|s| s.to_string()),
                files_completed: completed,
                total_files: total,
                bytes_downloaded: bytes_down,
                total_bytes,
            });
        };

        let is_modrinth_target = req.provider.eq_ignore_ascii_case("modrinth")
            || req.download_url.ends_with(".mrpack")
            || req.local_archive_path.as_deref().map(|p| p.ends_with(".mrpack")).unwrap_or(false);

        let (mc_version, server_type, _loader_ver, jar_file) = if is_modrinth_target {
            match self.install_with_mrpack_install(&app, &req, &server_dir).await {
                Ok(res) => res,
                Err(mrpack_err) => {
                    if self.is_cancelled(&install_id) {
                        let _ = std::fs::remove_dir_all(&server_dir);
                        return Err(anyhow!("Modpack installation cancelled by user"));
                    }
                    log::warn!(
                        "mrpack-install worker encountered error ({}); executing internal Rust installer fallback...",
                        mrpack_err
                    );

                    // Step 1 & 2: Fetching metadata & downloading modpack archive
                    emit("Downloading modpack archive", 5.0, "Initiating modpack package download...", None, 0, 0, 0, 0);

                    let pack_path = temp_dir.join("modpack.zip");

                    if let Some(ref local_path) = req.local_archive_path {
                        emit("Loading local archive", 10.0, "Reading local modpack archive...", None, 0, 0, 0, 0);
                        std::fs::copy(local_path, &pack_path)
                            .map_err(|e| anyhow!("Failed reading local archive at {:?}: {}", local_path, e))?;
                    } else {
                        SecurityPolicy::validate_download_url(&req.download_url)?;
                        let resp = self.client.get(&req.download_url).send().await?;
                        if !resp.status().is_success() {
                            return Err(anyhow!("Failed downloading modpack archive: HTTP {}", resp.status()));
                        }

                        let total_bytes = resp.content_length().unwrap_or(0);
                        let mut file = File::create(&pack_path)?;
                        let mut downloaded: u64 = 0;

                        let mut stream = resp.bytes_stream();
                        while let Some(chunk_res) = stream.next().await {
                            if self.is_cancelled(&install_id) {
                                let _ = std::fs::remove_dir_all(&server_dir);
                                return Err(anyhow!("Modpack installation cancelled by user"));
                            }

                            let chunk = chunk_res?;
                            file.write_all(&chunk)?;
                            downloaded += chunk.len() as u64;

                            let pct = if total_bytes > 0 {
                                5.0 + (downloaded as f32 / total_bytes as f32) * 20.0
                            } else {
                                15.0
                            };

                            emit("Downloading modpack archive", pct, "Downloading .mrpack archive...", None, 0, 0, downloaded, total_bytes);
                        }
                    }

                    if self.is_cancelled(&install_id) {
                        let _ = std::fs::remove_dir_all(&server_dir);
                        return Err(anyhow!("Modpack installation cancelled by user"));
                    }

                    // Step 3: Validating archive structure & reading index
                    emit("Validating archive", 26.0, "Reading modpack index structure...", None, 0, 0, 0, 0);

                    let pack_file = File::open(&pack_path)?;
                    let mut zip_archive = zip::ZipArchive::new(pack_file)
                        .map_err(|e| anyhow!("Invalid modpack zip archive: {}", e))?;

                    let mut index_file = zip_archive.by_name("modrinth.index.json")?;
                    let mut index_bytes = Vec::new();
                    index_file.read_to_end(&mut index_bytes)?;
                    drop(index_file);

                    let index = Self::parse_modrinth_index(&index_bytes)?;
                    let (mc_ver, s_type, l_ver) = Self::detect_loader_and_versions(&index.dependencies)?;

                    // Filter server-compatible files
                    emit("Resolving server files", 30.0, "Filtering client-only mods...", None, 0, 0, 0, 0);
                    let server_files = Self::filter_server_files(&index.files);
                    let total_files = server_files.len() as u32;

                    // Step 5: Download files declared in index
                    emit("Downloading dependencies", 35.0, &format!("Downloading {} server mods & assets...", total_files), None, 0, total_files, 0, 0);

                    let mut completed_files = 0u32;
                    for f in &server_files {
                        if self.is_cancelled(&install_id) {
                            let _ = std::fs::remove_dir_all(&server_dir);
                            return Err(anyhow!("Modpack installation cancelled by user"));
                        }

                        let target_path = SecurityPolicy::validate_safe_relative_path(&server_dir, &f.path)?;
                        let file_label = Path::new(&f.path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| f.path.clone());

                        let pct = 35.0 + (completed_files as f32 / total_files.max(1) as f32) * 35.0;
                        emit("Downloading dependencies", pct, &format!("Fetching {}", file_label), Some(&file_label), completed_files, total_files, 0, 0);

                        self.download_and_verify_file(&f.downloads, &f.hashes, &target_path).await
                            .map_err(|e| anyhow!("Failed downloading mod '{}': {}", f.path, e))?;

                        completed_files += 1;
                    }

                    // Step 6: Extract overrides & server-overrides
                    emit("Applying overrides", 72.0, "Extracting server configuration and overrides...", None, completed_files, total_files, 0, 0);
                    Self::extract_overrides_from_zip(&mut zip_archive, &server_dir)?;

                    // Step 7: Install dedicated loader
                    emit("Installing server loader", 80.0, &format!("Setting up dedicated {:?} loader...", s_type), None, completed_files, total_files, 0, 0);

                    let java_binary = if let Some(ref j) = req.java_path {
                        j.clone()
                    } else {
                        #[cfg(target_os = "windows")]
                        let jb = "java.exe".to_string();
                        #[cfg(not(target_os = "windows"))]
                        let jb = "java".to_string();
                        jb
                    };

                    let target_jar = self.install_loader(
                        &server_dir,
                        &s_type,
                        &mc_ver,
                        &l_ver,
                        &java_binary,
                    ).await?;

                    (mc_ver, s_type, l_ver, target_jar)
                }
            }
        } else {
            // CurseForge pack or custom zip archive
            emit("Downloading modpack archive", 5.0, "Initiating package download...", None, 0, 0, 0, 0);

            let pack_path = temp_dir.join("archive.zip");

            if let Some(ref local_path) = req.local_archive_path {
                emit("Loading local archive", 10.0, "Reading local archive...", None, 0, 0, 0, 0);
                std::fs::copy(local_path, &pack_path)
                    .map_err(|e| anyhow!("Failed reading local archive at {:?}: {}", local_path, e))?;
            } else {
                SecurityPolicy::validate_download_url(&req.download_url)?;
                let resp = self.client.get(&req.download_url).send().await?;
                if !resp.status().is_success() {
                    return Err(anyhow!("Failed downloading archive: HTTP {}", resp.status()));
                }

                let total_bytes = resp.content_length().unwrap_or(0);
                let mut file = File::create(&pack_path)?;
                let mut downloaded: u64 = 0;

                let mut stream = resp.bytes_stream();
                while let Some(chunk_res) = stream.next().await {
                    if self.is_cancelled(&install_id) {
                        let _ = std::fs::remove_dir_all(&server_dir);
                        return Err(anyhow!("Modpack installation cancelled by user"));
                    }

                    let chunk = chunk_res?;
                    file.write_all(&chunk)?;
                    downloaded += chunk.len() as u64;

                    let pct = if total_bytes > 0 {
                        5.0 + (downloaded as f32 / total_bytes as f32) * 20.0
                    } else {
                        15.0
                    };

                    emit("Downloading modpack archive", pct, "Downloading server archive...", None, 0, 0, downloaded, total_bytes);
                }
            }

            if self.is_cancelled(&install_id) {
                let _ = std::fs::remove_dir_all(&server_dir);
                return Err(anyhow!("Modpack installation cancelled by user"));
            }

            // Validating archive structure & opening zip
            emit("Validating archive", 26.0, "Reading archive structure...", None, 0, 0, 0, 0);

            let pack_file = File::open(&pack_path)?;
            let mut zip_archive = zip::ZipArchive::new(pack_file)
                .map_err(|e| anyhow!("Invalid modpack zip archive: {}", e))?;

            let has_curseforge_manifest = zip_archive.by_name("manifest.json").is_ok();

            if has_curseforge_manifest {
                // CurseForge manifest pack
                let mut manifest_file = zip_archive.by_name("manifest.json")?;
                let mut manifest_bytes = Vec::new();
                manifest_file.read_to_end(&mut manifest_bytes)?;
                drop(manifest_file);

            let manifest: crate::models::CurseForgeManifest = serde_json::from_slice(&manifest_bytes)
                .map_err(|e| anyhow!("Failed to parse CurseForge manifest.json: {}", e))?;

            let mc_ver = manifest.minecraft.version.clone();
            let loader_entry = manifest.minecraft.mod_loaders.iter().find(|l| l.primary).or_else(|| manifest.minecraft.mod_loaders.first());
            let (s_type, l_ver) = if let Some(loader) = loader_entry {
                let id = &loader.id;
                if id.starts_with("fabric-") {
                    (ServerType::Fabric, id["fabric-".len()..].to_string())
                } else if id.starts_with("neoforge-") {
                    (ServerType::NeoForge, id["neoforge-".len()..].to_string())
                } else if id.starts_with("forge-") {
                    (ServerType::Forge, id["forge-".len()..].to_string())
                } else if id.starts_with("quilt-") {
                    (ServerType::Quilt, id["quilt-".len()..].to_string())
                } else {
                    (ServerType::Vanilla, String::new())
                }
            } else {
                (ServerType::Vanilla, String::new())
            };

            // Extract overrides folder
            let overrides_folder = manifest.overrides.unwrap_or_else(|| "overrides".to_string());
            let prefix = format!("{}/", overrides_folder);

            for i in 0..zip_archive.len() {
                let mut file = zip_archive.by_index(i)?;
                let name = file.name().to_string();
                if name.starts_with(&prefix) {
                    let rel = &name[prefix.len()..];
                    if rel.is_empty() {
                        continue;
                    }
                    let target_path = SecurityPolicy::validate_safe_relative_path(&server_dir, rel)?;
                    if file.is_dir() {
                        std::fs::create_dir_all(&target_path)?;
                    } else {
                        if let Some(p) = target_path.parent() {
                            std::fs::create_dir_all(p)?;
                        }
                        let mut out = File::create(&target_path)?;
                        std::io::copy(&mut file, &mut out)?;
                    }
                }
            }

            // If manifest declares files/mods, download them into mods directory
            if !manifest.files.is_empty() {
                let total_mods = manifest.files.len() as u32;
                emit("Downloading mod dependencies", 35.0, &format!("Downloading {} mod dependencies...", total_mods), None, 0, total_mods, 0, 0);

                let cf_key = req.curseforge_api_key.as_deref().or(option_env!("CURSEFORGE_API_KEY"));
                let mods_dir = server_dir.join("mods");
                std::fs::create_dir_all(&mods_dir)?;

                let mut completed_mods = 0u32;
                for f_ref in &manifest.files {
                    if self.is_cancelled(&install_id) {
                        let _ = std::fs::remove_dir_all(&server_dir);
                        return Err(anyhow!("Modpack installation cancelled by user"));
                    }

                    let file_url_api = format!("https://api.curseforge.com/v1/mods/{}/files/{}", f_ref.project_id, f_ref.file_id);
                    let mut req_builder = self.client.get(&file_url_api);
                    if let Some(k) = cf_key {
                        req_builder = req_builder.header("x-api-key", k.trim());
                    }

                    if let Ok(file_resp) = req_builder.send().await {
                        if file_resp.status().is_success() {
                            if let Ok(file_json) = file_resp.json::<serde_json::Value>().await {
                                if let Some(data) = file_json.get("data") {
                                    let file_name = data.get("fileName").and_then(|v| v.as_str()).unwrap_or("mod.jar");
                                    let download_url = data.get("downloadUrl").and_then(|v| v.as_str()).map(|s| s.to_string())
                                        .unwrap_or_else(|| {
                                            format!("https://edge.forgecdn.net/files/{}/{}/{}", f_ref.file_id / 1000, f_ref.file_id % 1000, file_name)
                                        });

                                    let target_mod_path = mods_dir.join(file_name);
                                    let pct = 35.0 + (completed_mods as f32 / total_mods.max(1) as f32) * 35.0;
                                    emit("Downloading mod dependencies", pct, &format!("Fetching {}", file_name), Some(file_name), completed_mods, total_mods, 0, 0);

                                    if let Ok(dl_resp) = self.client.get(&download_url).send().await {
                                        if dl_resp.status().is_success() {
                                            if let Ok(bytes) = dl_resp.bytes().await {
                                                let _ = std::fs::write(&target_mod_path, &bytes);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    completed_mods += 1;
                }
            }

            // Install dedicated loader
            emit("Installing server loader", 80.0, &format!("Setting up dedicated {:?} loader...", s_type), None, 0, 0, 0, 0);

            let java_binary = if let Some(ref j) = req.java_path {
                j.clone()
            } else {
                #[cfg(target_os = "windows")]
                let jb = "java.exe".to_string();
                #[cfg(not(target_os = "windows"))]
                let jb = "java".to_string();
                jb
            };

            let target_jar = self.install_loader(
                &server_dir,
                &s_type,
                &mc_ver,
                &l_ver,
                &java_binary,
            ).await?;

            (mc_ver, s_type, l_ver, target_jar)
        } else {
            // General zip archive extraction (e.g. pre-built CurseForge server pack or custom zip)
            emit("Extracting server files", 50.0, "Extracting pre-built server pack...", None, 0, 0, 0, 0);

            let common_root = Self::detect_common_zip_root(&mut zip_archive);

            for i in 0..zip_archive.len() {
                let mut file = zip_archive.by_index(i)?;
                let name = file.name().to_string();
                let stripped_name = if let Some(ref root) = common_root {
                    name.strip_prefix(root).unwrap_or(&name)
                } else {
                    &name
                };

                if stripped_name.is_empty() {
                    continue;
                }

                let target_path = SecurityPolicy::validate_safe_relative_path(&server_dir, stripped_name)?;
                if file.is_dir() {
                    std::fs::create_dir_all(&target_path)?;
                } else {
                    if let Some(p) = target_path.parent() {
                        std::fs::create_dir_all(p)?;
                    }
                    let mut out = File::create(&target_path)?;
                    std::io::copy(&mut file, &mut out)?;
                }
            }

            let mut detected_jar = "server.jar".to_string();
            if server_dir.join("run.bat").exists() {
                detected_jar = "run.bat".to_string();
            } else if server_dir.join("start.bat").exists() {
                detected_jar = "start.bat".to_string();
            } else if server_dir.join("launch.bat").exists() {
                detected_jar = "launch.bat".to_string();
            } else if server_dir.join("run.sh").exists() {
                detected_jar = "run.sh".to_string();
            } else if server_dir.join("start.sh").exists() {
                detected_jar = "start.sh".to_string();
            } else {
                for entry in std::fs::read_dir(&server_dir)?.filter_map(Result::ok) {
                    let n = entry.file_name().to_string_lossy().to_string();
                    if n.ends_with(".jar") && (n.contains("server") || n.contains("fabric") || n.contains("forge") || n.contains("neoforge") || n.contains("quilt")) {
                        detected_jar = n;
                        break;
                    }
                }
            }

            ("1.20.1".to_string(), ServerType::Fabric, String::new(), detected_jar)
            }
        };

        // Step 8: Configuring server.properties & EULA
        emit("Configuring server", 92.0, "Writing server properties and EULA status...", None, 0, 0, 0, 0);

        // Remove temporary install dir
        let _ = std::fs::remove_dir_all(&temp_dir);

        // Write server.properties
        let mut props = std::collections::BTreeMap::new();
        props.insert("server-port".to_string(), port.to_string());
        props.insert("motd".to_string(), format!("{} - Modpack Server", req.name));
        props.insert("difficulty".to_string(), "normal".to_string());
        props.insert("gamemode".to_string(), "survival".to_string());
        let online_mode = req.online_mode.unwrap_or(true);
        props.insert("online-mode".to_string(), online_mode.to_string());
        let _ = crate::config_manager::ConfigManager::apply_changes(&server_dir, &props);

        // Write eula.txt explicitly based on user choice
        let eula_content = format!("#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).\neula={}\n", req.accept_eula);
        let _ = std::fs::write(server_dir.join("eula.txt"), eula_content);

        // Step 9: Save profile to database
        emit("Ready to start", 100.0, "Modpack server ready!", None, 0, 0, 0, 0);

        let resolved_java = if let Some(ref j) = req.java_path {
            if !j.trim().is_empty() {
                Some(j.clone())
            } else {
                crate::java_manager::JavaManager::find_or_install_compatible_java(&self.data_dir, &mc_version, Some(&app)).await.ok()
            }
        } else {
            crate::java_manager::JavaManager::find_or_install_compatible_java(&self.data_dir, &mc_version, Some(&app)).await.ok()
        };

        let now = chrono::Utc::now().timestamp();
        let profile = ServerProfile {
            id: server_id.clone(),
            name: req.name.clone(),
            server_type,
            minecraft_version: mc_version,
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

        Ok(profile)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModrinthFileEnv;

    #[test]
    fn test_parse_modrinth_index_valid() {
        let json = r#"{
            "formatVersion": 1,
            "game": "minecraft",
            "versionId": "v1.0.0",
            "name": "Awesome Pack",
            "summary": "Pack description",
            "files": [
                {
                    "path": "mods/sodium.jar",
                    "hashes": {
                        "sha1": "abcdef123456",
                        "sha512": "356d02d8846b83c2ba06ac44989304aa3de1d379d093bec3f90f08878a347c1d27fc57247123a1e2d6cfbd5d3675df487eb8e5d5351fab131f0af89134a5e122"
                    },
                    "env": {
                        "client": "required",
                        "server": "unsupported"
                    },
                    "downloads": ["https://cdn.modrinth.com/data/sodium.jar"],
                    "fileSize": 1048576
                },
                {
                    "path": "mods/lithium.jar",
                    "hashes": {
                        "sha512": "abc"
                    },
                    "env": {
                        "client": "optional",
                        "server": "required"
                    },
                    "downloads": ["https://cdn.modrinth.com/data/lithium.jar"],
                    "fileSize": 524288
                }
            ],
            "dependencies": {
                "minecraft": "1.20.1",
                "fabric-loader": "0.15.11"
            }
        }"#;

        let index = ModpackManager::parse_modrinth_index(json.as_bytes()).expect("Valid index should parse");
        assert_eq!(index.name, "Awesome Pack");
        assert_eq!(index.files.len(), 2);

        let (mc, loader_type, loader_ver) = ModpackManager::detect_loader_and_versions(&index.dependencies).unwrap();
        assert_eq!(mc, "1.20.1");
        assert_eq!(loader_type, ServerType::Fabric);
        assert_eq!(loader_ver, "0.15.11");
    }

    #[test]
    fn test_filter_server_files_skips_unsupported() {
        let files = vec![
            ModrinthIndexFile {
                path: "mods/client_only.jar".to_string(),
                hashes: HashMap::new(),
                env: Some(ModrinthFileEnv {
                    client: Some("required".to_string()),
                    server: Some("unsupported".to_string()),
                }),
                downloads: vec![],
                file_size: 100,
            },
            ModrinthIndexFile {
                path: "mods/server_side.jar".to_string(),
                hashes: HashMap::new(),
                env: Some(ModrinthFileEnv {
                    client: Some("optional".to_string()),
                    server: Some("required".to_string()),
                }),
                downloads: vec![],
                file_size: 200,
            },
        ];

        let filtered = ModpackManager::filter_server_files(&files);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].path, "mods/server_side.jar");
    }

    #[test]
    fn test_verify_file_hash() {
        let data = b"Hello, MCSet Modpack!";
        let mut hasher = Sha512::new();
        hasher.update(data);
        let correct_hash = hex::encode(hasher.finalize());

        let mut hashes = HashMap::new();
        hashes.insert("sha512".to_string(), correct_hash);

        assert!(ModpackManager::verify_file_hash(data, &hashes).is_ok());

        let mut bad_hashes = HashMap::new();
        bad_hashes.insert("sha512".to_string(), "0000000000000000000000000000".to_string());
        assert!(ModpackManager::verify_file_hash(data, &bad_hashes).is_err());
    }

    #[test]
    fn test_detect_loaders() {
        let mut deps = HashMap::new();
        deps.insert("minecraft".to_string(), "1.20.4".to_string());
        deps.insert("neoforge".to_string(), "20.4.80-beta".to_string());

        let (mc, loader, ver) = ModpackManager::detect_loader_and_versions(&deps).unwrap();
        assert_eq!(mc, "1.20.4");
        assert_eq!(loader, ServerType::NeoForge);
        assert_eq!(ver, "20.4.80-beta");

        // Quilt
        let mut quilt_deps = HashMap::new();
        quilt_deps.insert("minecraft".to_string(), "1.20.1".to_string());
        quilt_deps.insert("quilt-loader".to_string(), "0.23.0".to_string());
        let (mc, loader, ver) = ModpackManager::detect_loader_and_versions(&quilt_deps).unwrap();
        assert_eq!(mc, "1.20.1");
        assert_eq!(loader, ServerType::Quilt);
        assert_eq!(ver, "0.23.0");

        // Forge
        let mut forge_deps = HashMap::new();
        forge_deps.insert("minecraft".to_string(), "1.19.2".to_string());
        forge_deps.insert("forge".to_string(), "43.3.0".to_string());
        let (mc, loader, ver) = ModpackManager::detect_loader_and_versions(&forge_deps).unwrap();
        assert_eq!(mc, "1.19.2");
        assert_eq!(loader, ServerType::Forge);
        assert_eq!(ver, "43.3.0");
    }

    #[test]
    fn test_path_traversal_rejection() {
        let base = PathBuf::from("C:\\server");
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "mods/fabric-api.jar").is_ok());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "../evil.jar").is_err());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "mods/../../evil.jar").is_err());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "/root/evil.jar").is_err());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "D:\\Windows\\hack.exe").is_err());
    }

    #[test]
    fn test_cancellation_tracking() {
        let manager = ModpackManager::new(PathBuf::from("temp"));
        assert!(!manager.is_cancelled("install_123"));
        manager.cancel_install("install_123");
        assert!(manager.is_cancelled("install_123"));
    }

    #[test]
    fn test_mrpack_install_flavor_parsing() {
        let line = "Flavor dependencies: {Minecraft:1.21.1 Fabric:0.19.5 Quilt: Forge:}";
        let (mc, server_type, loader_ver) = ModpackManager::parse_flavor_dependencies(line);
        assert_eq!(mc, Some("1.21.1".to_string()));
        assert_eq!(server_type, Some(ServerType::Fabric));
        assert_eq!(loader_ver, Some("0.19.5".to_string()));

        let forge_line = "Flavor dependencies: {Minecraft:1.20.1 Forge:47.2.0}";
        let (mc2, server_type2, loader_ver2) = ModpackManager::parse_flavor_dependencies(forge_line);
        assert_eq!(mc2, Some("1.20.1".to_string()));
        assert_eq!(server_type2, Some(ServerType::Forge));
        assert_eq!(loader_ver2, Some("47.2.0".to_string()));

        let neoforge_line = "Flavor dependencies: {Minecraft:1.20.4 NeoForge:20.4.80-beta}";
        let (mc3, server_type3, loader_ver3) = ModpackManager::parse_flavor_dependencies(neoforge_line);
        assert_eq!(mc3, Some("1.20.4".to_string()));
        assert_eq!(server_type3, Some(ServerType::NeoForge));
        assert_eq!(loader_ver3, Some("20.4.80-beta".to_string()));

        let quilt_line = "Flavor dependencies: {Minecraft:1.19.2 Quilt:0.19.1}";
        let (mc4, server_type4, loader_ver4) = ModpackManager::parse_flavor_dependencies(quilt_line);
        assert_eq!(mc4, Some("1.19.2".to_string()));
        assert_eq!(server_type4, Some(ServerType::Quilt));
        assert_eq!(loader_ver4, Some("0.19.1".to_string()));
    }

    #[test]
    fn test_mrpack_install_stdout_parsers() {
        let count_line = "Downloading 77 dependencies...";
        assert_eq!(ModpackManager::parse_dependency_count(count_line), Some(77));

        let file_line = "Downloaded: C:\\Users\\user\\server\\mods\\krypton-0.2.8.jar";
        assert_eq!(ModpackManager::parse_downloaded_file(file_line), Some("krypton-0.2.8.jar".to_string()));

        let jar_line = "Server jar downloaded to: C:\\server\\fabric-server-mc.1.21.1-loader.0.19.5-launcher.1.1.2.jar";
        assert_eq!(
            ModpackManager::parse_server_jar(jar_line),
            Some("fabric-server-mc.1.21.1-loader.0.19.5-launcher.1.1.2.jar".to_string())
        );
    }
}
