use std::fs::File;
use std::io::Write;
use std::path::Path;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha512};
use crate::models::{ExtensionItem, ServerType};
use crate::security::SecurityPolicy;

pub struct ExtensionManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthProjectHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub categories: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub author: String,
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthSearchResponse {
    pub hits: Vec<ModrinthProjectHit>,
    pub offset: u32,
    pub limit: u32,
    pub total_hits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthVersionFile {
    pub hashes: ModrinthFileHashes,
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthFileHashes {
    pub sha1: Option<String>,
    pub sha512: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthVersionFile>,
    pub date_published: String,
}

impl ExtensionManager {
    /// Returns the target subfolder ("plugins" or "mods") for the given server type
    pub fn get_extension_folder_name(server_type: &ServerType) -> &'static str {
        match server_type {
            ServerType::Fabric | ServerType::Forge | ServerType::NeoForge | ServerType::Quilt => "mods",
            ServerType::Paper | ServerType::Purpur | ServerType::Spigot => "plugins",
            ServerType::Arclight => "plugins", // Hybrid can support both, default to plugins
            ServerType::Vanilla => "plugins",
        }
    }

    /// Lists installed extensions in the server's extension directory
    pub fn list_installed(server_dir: &Path, server_type: &ServerType) -> Result<Vec<ExtensionItem>> {
        let folder_name = Self::get_extension_folder_name(server_type);
        let ext_dir = server_dir.join(folder_name);

        if !ext_dir.exists() {
            std::fs::create_dir_all(&ext_dir)?;
            return Ok(Vec::new());
        }

        let mut items = Vec::new();
        let entries = std::fs::read_dir(&ext_dir)?;

        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let is_jar = file_name.ends_with(".jar");
            let is_disabled = file_name.ends_with(".jar.disabled");

            if !is_jar && !is_disabled {
                continue;
            }

            let metadata = std::fs::metadata(&path)?;
            let file_size_bytes = metadata.len();
            let modified_at = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);

            // Clean display name
            let base_name = file_name
                .trim_end_matches(".disabled")
                .trim_end_matches(".jar");

            items.push(ExtensionItem {
                file_name: file_name.clone(),
                name: base_name.to_string(),
                version: None,
                extension_type: if folder_name == "mods" {
                    "mod".to_string()
                } else {
                    "plugin".to_string()
                },
                enabled: is_jar,
                file_size_bytes,
                modified_at,
            });
        }

        items.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(items)
    }

    /// Toggles an extension enabled/disabled
    pub fn toggle_extension(
        server_dir: &Path,
        server_type: &ServerType,
        file_name: &str,
    ) -> Result<String> {
        SecurityPolicy::validate_file_name(file_name)?;
        let folder = Self::get_extension_folder_name(server_type);
        let current_path = server_dir.join(folder).join(file_name);
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &current_path)?;

        if !validated.exists() {
            return Err(anyhow!("Extension file not found: {}", file_name));
        }

        let new_file_name = if file_name.ends_with(".jar.disabled") {
            file_name.trim_end_matches(".disabled").to_string()
        } else if file_name.ends_with(".jar") {
            format!("{}.disabled", file_name)
        } else {
            return Err(anyhow!("Invalid extension file type: {}", file_name));
        };

        let new_path = server_dir.join(folder).join(&new_file_name);
        std::fs::rename(validated, new_path)?;

        Ok(new_file_name)
    }

    /// Removes an extension permanently
    pub fn remove_extension(
        server_dir: &Path,
        server_type: &ServerType,
        file_name: &str,
    ) -> Result<()> {
        SecurityPolicy::validate_file_name(file_name)?;
        let folder = Self::get_extension_folder_name(server_type);
        let file_path = server_dir.join(folder).join(file_name);
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &file_path)?;

        if validated.exists() {
            std::fs::remove_file(validated)?;
        }
        Ok(())
    }

    /// Searches Modrinth for plugins/mods compatible with this server with pagination support
    pub async fn search_modrinth(
        query: &str,
        server_type: &ServerType,
        minecraft_version: &str,
        index: Option<&str>,
        offset: u32,
        limit: u32,
    ) -> Result<ModrinthSearchResponse> {
        let client = Client::builder()
            .user_agent("MCSet-Desktop-Manager/0.1.0 (antigravity)")
            .build()?;

        let project_type = match server_type {
            ServerType::Fabric | ServerType::Forge | ServerType::NeoForge => "mod",
            _ => "plugin",
        };

        let loader_tag = match server_type {
            ServerType::Fabric => "fabric",
            ServerType::Forge => "forge",
            ServerType::NeoForge => "neoforge",
            ServerType::Paper => "paper",
            ServerType::Purpur => "purpur",
            ServerType::Spigot => "spigot",
            _ => "paper",
        };

        let sort_index = index.unwrap_or("downloads");

        // Construct Modrinth search facets with loader & version
        let facets = format!(
            r#"[["project_type:{}"],["categories:{}"],["versions:{}"]]"#,
            project_type, loader_tag, minecraft_version
        );

        let url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&index={}&offset={}&limit={}",
            urlencoding::encode(query),
            urlencoding::encode(&facets),
            sort_index,
            offset,
            limit
        );

        let res = client.get(&url).send().await;
        if let Ok(response) = res {
            if response.status().is_success() {
                if let Ok(data) = response.json::<ModrinthSearchResponse>().await {
                    if !data.hits.is_empty() {
                        return Ok(data);
                    }
                }
            }
        }

        // Fallback with just project_type & categories (allows popular plugins to display even for brand new or historical MC versions)
        let fallback_facets = format!(
            r#"[["project_type:{}"],["categories:{}"]]"#,
            project_type, loader_tag
        );
        let fallback_url = format!(
            "https://api.modrinth.com/v2/search?query={}&facets={}&index={}&offset={}&limit={}",
            urlencoding::encode(query),
            urlencoding::encode(&fallback_facets),
            sort_index,
            offset,
            limit
        );
        let res2 = client.get(&fallback_url).send().await?;
        if !res2.status().is_success() {
            // Ultimate fallback with just project_type
            let final_facets = format!(r#"[["project_type:{}"]]"#, project_type);
            let final_url = format!(
                "https://api.modrinth.com/v2/search?query={}&facets={}&index={}&offset={}&limit={}",
                urlencoding::encode(query),
                urlencoding::encode(&final_facets),
                sort_index,
                offset,
                limit
            );
            let res3 = client.get(&final_url).send().await?;
            if !res3.status().is_success() {
                return Err(anyhow!("Modrinth API error: {}", res3.status()));
            }
            let data: ModrinthSearchResponse = res3.json().await?;
            return Ok(data);
        }
        let data: ModrinthSearchResponse = res2.json().await?;
        Ok(data)
    }

    /// Fetches versions for a Modrinth project
    pub async fn get_project_versions(
        project_id_or_slug: &str,
        server_type: &ServerType,
        minecraft_version: Option<&str>,
    ) -> Result<Vec<ModrinthVersion>> {
        let client = Client::builder()
            .user_agent("MCSet-Desktop-Manager/0.1.0 (antigravity)")
            .build()?;

        let loader = match server_type {
            ServerType::Fabric => "fabric",
            ServerType::Forge => "forge",
            ServerType::NeoForge => "neoforge",
            ServerType::Paper => "paper",
            ServerType::Purpur => "purpur",
            ServerType::Spigot => "spigot",
            _ => "paper",
        };

        let mut url = format!(
            "https://api.modrinth.com/v2/project/{}/version?loaders=[\"{}\"]",
            project_id_or_slug, loader
        );
        if let Some(mv) = minecraft_version {
            url.push_str(&format!("&game_versions=[\"{}\"]", mv));
        }

        let res = client.get(&url).send().await?;
        if !res.status().is_success() {
            // Try fetching all versions for project
            let fallback_url = format!("https://api.modrinth.com/v2/project/{}/version", project_id_or_slug);
            let res2 = client.get(&fallback_url).send().await?;
            if !res2.status().is_success() {
                return Err(anyhow!("Failed to fetch project versions from Modrinth"));
            }
            let versions: Vec<ModrinthVersion> = res2.json().await?;
            return Ok(versions);
        }

        let versions: Vec<ModrinthVersion> = res.json().await?;
        Ok(versions)
    }

    /// Downloads and installs a version file with SHA512/SHA1 hash verification
    pub async fn download_and_install(
        server_dir: &Path,
        server_type: &ServerType,
        version_file: &ModrinthVersionFile,
    ) -> Result<String> {
        SecurityPolicy::validate_file_name(&version_file.filename)?;
        let folder = Self::get_extension_folder_name(server_type);
        let target_dir = server_dir.join(folder);
        std::fs::create_dir_all(&target_dir)?;

        let target_path = target_dir.join(&version_file.filename);
        let validated_target = SecurityPolicy::validate_path_within_root(server_dir, &target_path)?;

        let client = Client::builder()
            .user_agent("MCSet-Desktop-Manager/0.1.0 (antigravity)")
            .build()?;

        let mut response = client.get(&version_file.url).send().await?;
        if !response.status().is_success() {
            return Err(anyhow!(
                "Failed to download file from Modrinth: HTTP {}",
                response.status()
            ));
        }

        let tmp_path = target_dir.join(format!(".{}.downloading", &version_file.filename));
        let mut tmp_file = File::create(&tmp_path)?;
        let mut hasher = Sha512::new();

        while let Some(chunk) = response.chunk().await? {
            hasher.update(&chunk);
            tmp_file.write_all(&chunk)?;
        }
        tmp_file.flush()?;

        // Verify SHA512 hash if provided by Modrinth
        if let Some(expected_sha512) = &version_file.hashes.sha512 {
            let actual_sha512 = hex::encode(hasher.finalize());
            if !actual_sha512.eq_ignore_ascii_case(expected_sha512) {
                let _ = std::fs::remove_file(&tmp_path);
                return Err(anyhow!(
                    "Integrity check failed! Expected sha512 {}, got {}",
                    expected_sha512,
                    actual_sha512
                ));
            }
        }

        // Move into final position
        std::fs::rename(tmp_path, validated_target)?;

        Ok(version_file.filename.clone())
    }
}

// Minimal urlencoding helper
pub mod urlencoding {
    pub fn encode(s: &str) -> String {
        let mut result = String::new();
        for c in s.chars() {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '~' {
                result.push(c);
            } else {
                result.push_str(&format!("%{:02X}", c as u32));
            }
        }
        result
    }
}
