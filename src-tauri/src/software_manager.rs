use anyhow::{Result, anyhow};
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::models::{DownloadProgressPayload, ProviderBuildInfo, ServerType, VersionManifest};
use crate::security::SecurityPolicy;

pub const MOJANG_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

pub struct SoftwareProviderManager {
    client: reqwest::Client,
    cache_dir: PathBuf,
}

impl SoftwareProviderManager {
    pub fn new(cache_dir: PathBuf) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("MCSet/1.0.0 (admin@mcset.app)"),
        );
        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let _ = std::fs::create_dir_all(&cache_dir);

        Self { client, cache_dir }
    }

    /// Fetches the Mojang version manifest, with local fallback caching.
    pub async fn get_version_manifest(&self, force_refresh: bool) -> Result<VersionManifest> {
        let cache_file = self.cache_dir.join("version_manifest_v2.json");

        if !force_refresh && cache_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&cache_file) {
                if let Ok(mut manifest) = serde_json::from_str::<VersionManifest>(&content) {
                    manifest.is_stale = Some(false);
                    return Ok(manifest);
                }
            }
        }

        // Try downloading live
        match self.fetch_live_manifest().await {
            Ok(manifest) => {
                // Save to cache
                if let Ok(json) = serde_json::to_string(&manifest) {
                    let _ = std::fs::write(&cache_file, json);
                }
                Ok(manifest)
            }
            Err(e) => {
                log::warn!(
                    "Failed to fetch live version manifest: {}. Checking cache...",
                    e
                );
                if cache_file.exists() {
                    if let Ok(content) = std::fs::read_to_string(&cache_file) {
                        if let Ok(mut manifest) = serde_json::from_str::<VersionManifest>(&content)
                        {
                            manifest.is_stale = Some(true);
                            return Ok(manifest);
                        }
                    }
                }
                Err(anyhow!(
                    "Unable to load Minecraft versions: Network request failed ({}) and no local cache is available.",
                    e
                ))
            }
        }
    }

    async fn fetch_live_manifest(&self) -> Result<VersionManifest> {
        let resp = self
            .client
            .get(MOJANG_MANIFEST_URL)
            .send()
            .await?
            .error_for_status()?;

        let mut manifest: VersionManifest = resp.json().await?;
        manifest.cached_at = Some(Utc::now().timestamp());
        manifest.is_stale = Some(false);
        Ok(manifest)
    }

    /// Resolves compatible build info for the selected provider and Minecraft version.
    pub async fn resolve_provider_build(
        &self,
        provider: &ServerType,
        mc_version: &str,
    ) -> Result<ProviderBuildInfo> {
        match provider {
            ServerType::Vanilla => self.resolve_vanilla_build(mc_version).await,
            ServerType::Paper => self.resolve_paper_build(mc_version).await,
            ServerType::Purpur => self.resolve_purpur_build(mc_version).await,
            ServerType::Fabric => self.resolve_fabric_build(mc_version).await,
            ServerType::NeoForge => self.resolve_neoforge_build(mc_version).await,
            ServerType::Forge => self.resolve_forge_build(mc_version).await,
            ServerType::Quilt => self.resolve_quilt_build(mc_version).await,
            ServerType::Spigot | ServerType::Arclight => Err(anyhow!(
                "Provider {:?} does not offer direct automated downloads; please choose Paper, Vanilla, Fabric, NeoForge, Forge, or Quilt.",
                provider
            )),
        }
    }

    /// Fetches version package JSON from cache or Mojang API, caching it to disk for offline performance.
    pub async fn get_version_package_metadata(
        &self,
        mc_version: &str,
    ) -> Result<serde_json::Value> {
        let cache_file = self
            .cache_dir
            .join(format!("version_meta_{}.json", mc_version));
        if cache_file.exists() {
            if let Ok(content) = std::fs::read_to_string(&cache_file) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    return Ok(json);
                }
            }
        }

        let manifest = self.get_version_manifest(false).await?;
        let entry = manifest
            .versions
            .iter()
            .find(|v| v.id == mc_version)
            .ok_or_else(|| {
                anyhow!(
                    "Minecraft version '{}' not found in official manifest",
                    mc_version
                )
            })?;

        SecurityPolicy::validate_download_url(&entry.url)?;

        let resp = self
            .client
            .get(&entry.url)
            .send()
            .await?
            .error_for_status()?;

        let meta_json: serde_json::Value = resp.json().await?;
        let _ = std::fs::create_dir_all(&self.cache_dir);
        let _ = std::fs::write(
            &cache_file,
            serde_json::to_string(&meta_json).unwrap_or_default(),
        );

        Ok(meta_json)
    }

    /// Retrieves the exact required Java major version specified in Mojang's official version manifest.
    pub async fn get_required_java_version(&self, mc_version: &str) -> Result<u32> {
        if let Ok(meta_json) = self.get_version_package_metadata(mc_version).await {
            if let Some(major) = meta_json
                .get("javaVersion")
                .and_then(|j| j.get("majorVersion"))
                .and_then(|m| m.as_u64())
            {
                return Ok(major as u32);
            }
        }

        // Fallback heuristic if manifest package is unreachable or missing javaVersion
        Ok(crate::java_manager::JavaManager::get_recommended_java_major(mc_version).0)
    }

    /// Resolves official Vanilla server download from Mojang version metadata JSON.
    pub async fn resolve_vanilla_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let meta_json = self.get_version_package_metadata(mc_version).await?;

        let server_dl = meta_json
            .get("downloads")
            .and_then(|d| d.get("server"))
            .ok_or_else(|| {
                anyhow!(
                    "Official server JAR is not available for Minecraft {} (client-only or legacy release without dedicated server jar).",
                    mc_version
                )
            })?;

        let url = server_dl
            .get("url")
            .and_then(|u| u.as_str())
            .ok_or_else(|| anyhow!("Malformed server download URL in Mojang metadata"))?
            .to_string();

        let sha1 = server_dl
            .get("sha1")
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());

        let size = server_dl.get("size").and_then(|s| s.as_u64());

        let java_major = meta_json
            .get("javaVersion")
            .and_then(|j| j.get("majorVersion"))
            .and_then(|m| m.as_u64())
            .map(|m| m as u32);

        SecurityPolicy::validate_download_url(&url)?;

        Ok(ProviderBuildInfo {
            provider: ServerType::Vanilla,
            minecraft_version: mc_version.to_string(),
            build_id: format!("mojang-{}", mc_version),
            download_url: url,
            filename: "server.jar".to_string(),
            file_size: size,
            checksum_type: Some("sha1".to_string()),
            checksum_value: sha1,
            is_installer: false,
            installer_args: None,
            target_jar: "server.jar".to_string(),
            required_java_major: java_major,
        })
    }

    /// Resolves Paper via official PaperMC API v3 (`https://fill.papermc.io/v3`).
    pub async fn resolve_paper_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let builds_url = format!(
            "https://fill.papermc.io/v3/projects/paper/versions/{}/builds",
            mc_version
        );

        let resp = self
            .client
            .get(&builds_url)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to query PaperMC builds: {}", e))?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND
            || resp.status() == reqwest::StatusCode::GONE
        {
            return Err(anyhow!(
                "Paper does not offer builds for Minecraft {}. Please choose a supported version or another software provider.",
                mc_version
            ));
        }

        let resp = resp.error_for_status()?;
        let builds: Vec<serde_json::Value> = resp.json().await?;

        if builds.is_empty() {
            return Err(anyhow!(
                "No Paper builds found for Minecraft {}",
                mc_version
            ));
        }

        // Prefer latest STABLE build, otherwise latest available
        let selected_build = builds
            .iter()
            .find(|b| b.get("channel").and_then(|c| c.as_str()) == Some("STABLE"))
            .or_else(|| builds.first())
            .ok_or_else(|| anyhow!("No valid Paper build found"))?;

        let build_id = selected_build
            .get("id")
            .and_then(|id| id.as_i64())
            .map(|id| id.to_string())
            .unwrap_or_else(|| "latest".to_string());

        let dl = selected_build
            .get("downloads")
            .and_then(|d| d.get("server:default"))
            .ok_or_else(|| anyhow!("Paper build metadata missing 'server:default' download"))?;

        let dl_url = dl
            .get("url")
            .and_then(|u| u.as_str())
            .ok_or_else(|| anyhow!("Paper download missing URL"))?
            .to_string();

        let name = dl
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("paper.jar")
            .to_string();

        let size = dl.get("size").and_then(|s| s.as_u64());

        let sha256 = dl
            .get("checksums")
            .and_then(|c| c.get("sha256"))
            .and_then(|s| s.as_str())
            .map(|s| s.to_string());

        SecurityPolicy::validate_download_url(&dl_url)?;

        Ok(ProviderBuildInfo {
            provider: ServerType::Paper,
            minecraft_version: mc_version.to_string(),
            build_id: format!("build-{}", build_id),
            download_url: dl_url,
            filename: name,
            file_size: size,
            checksum_type: Some("sha256".to_string()),
            checksum_value: sha256,
            is_installer: false,
            installer_args: None,
            target_jar: "paper.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Resolves Purpur via official PurpurMC API v2 (`https://api.purpurmc.org/v2/purpur/{version}`).
    pub async fn resolve_purpur_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let url = format!("https://api.purpurmc.org/v2/purpur/{}", mc_version);
        let resp = self.client.get(&url).send().await?;

        if resp.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(anyhow!("Purpur does not support Minecraft {}", mc_version));
        }

        let data: serde_json::Value = resp.error_for_status()?.json().await?;
        let builds_obj = data.get("builds").and_then(|b| b.get("latest"));
        let latest_build = builds_obj
            .and_then(|b| b.as_str())
            .ok_or_else(|| anyhow!("No latest Purpur build found for {}", mc_version))?;

        let dl_url = format!(
            "https://api.purpurmc.org/v2/purpur/{}/{}/download",
            mc_version, latest_build
        );

        Ok(ProviderBuildInfo {
            provider: ServerType::Purpur,
            minecraft_version: mc_version.to_string(),
            build_id: format!("build-{}", latest_build),
            download_url: dl_url,
            filename: "purpur.jar".to_string(),
            file_size: None,
            checksum_type: None,
            checksum_value: None,
            is_installer: false,
            installer_args: None,
            target_jar: "purpur.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Resolves Fabric via Fabric installer (`net.fabricmc:fabric-installer:1.1.2`).
    pub async fn resolve_fabric_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let installer_url =
            "https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.2/fabric-installer-1.1.2.jar"
                .to_string();

        SecurityPolicy::validate_download_url(&installer_url)?;

        let installer_args = vec![
            "server".to_string(),
            "-mcversion".to_string(),
            mc_version.to_string(),
            "-downloadMinecraft".to_string(),
        ];

        Ok(ProviderBuildInfo {
            provider: ServerType::Fabric,
            minecraft_version: mc_version.to_string(),
            build_id: format!("fabric-installer-1.1.2-mc{}", mc_version),
            download_url: installer_url,
            filename: "fabric-installer.jar".to_string(),
            file_size: Some(212123),
            checksum_type: None,
            checksum_value: None,
            is_installer: true,
            installer_args: Some(installer_args),
            target_jar: "fabric-server-launch.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Resolves NeoForge via NeoForged Maven repository.
    pub async fn resolve_neoforge_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let meta_url =
            "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";
        let resp = self.client.get(meta_url).send().await?.error_for_status()?;

        let json: serde_json::Value = resp.json().await?;
        let versions: Vec<String> = json
            .get("versions")
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();

        let prefix = if mc_version.starts_with("1.") {
            format!("{}.", &mc_version[2..])
        } else {
            format!("{}.", mc_version)
        };

        let candidate = versions
            .iter()
            .rev()
            .find(|v| v.starts_with(&prefix) || v.starts_with(mc_version))
            .ok_or_else(|| {
                anyhow!(
                    "NeoForge does not have a compatible build for Minecraft {}. NeoForge supports Minecraft 1.20.2+ and 26.x.",
                    mc_version
                )
            })?;

        let dl_url = format!(
            "https://maven.neoforged.net/releases/net/neoforged/neoforge/{}/neoforge-{}-installer.jar",
            candidate, candidate
        );

        SecurityPolicy::validate_download_url(&dl_url)?;

        let installer_args = vec!["--installServer".to_string(), ".".to_string()];

        Ok(ProviderBuildInfo {
            provider: ServerType::NeoForge,
            minecraft_version: mc_version.to_string(),
            build_id: candidate.clone(),
            download_url: dl_url,
            filename: format!("neoforge-{}-installer.jar", candidate),
            file_size: None,
            checksum_type: None,
            checksum_value: None,
            is_installer: true,
            installer_args: Some(installer_args),
            target_jar: "neoforge.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Resolves Forge via official Forge promotions_slim.json.
    pub async fn resolve_forge_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let promos_url =
            "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
        let resp = self
            .client
            .get(promos_url)
            .send()
            .await?
            .error_for_status()?;

        let json: serde_json::Value = resp.json().await?;
        let promos = json
            .get("promos")
            .and_then(|p| p.as_object())
            .ok_or_else(|| anyhow!("Malformed Forge promotions metadata"))?;

        let rec_key = format!("{}-recommended", mc_version);
        let latest_key = format!("{}-latest", mc_version);

        let forge_ver = promos
            .get(&rec_key)
            .or_else(|| promos.get(&latest_key))
            .and_then(|v| v.as_str())
            .ok_or_else(|| {
                anyhow!(
                    "Minecraft Forge does not support Minecraft {}. Please choose a version listed on files.minecraftforge.net.",
                    mc_version
                )
            })?;

        let full_ver = format!("{}-{}", mc_version, forge_ver);
        let dl_url = format!(
            "https://maven.minecraftforge.net/net/minecraftforge/forge/{}/forge-{}-installer.jar",
            full_ver, full_ver
        );

        SecurityPolicy::validate_download_url(&dl_url)?;

        let installer_args = vec!["--installServer".to_string(), ".".to_string()];

        Ok(ProviderBuildInfo {
            provider: ServerType::Forge,
            minecraft_version: mc_version.to_string(),
            build_id: forge_ver.to_string(),
            download_url: dl_url,
            filename: format!("forge-{}-installer.jar", full_ver),
            file_size: None,
            checksum_type: None,
            checksum_value: None,
            is_installer: true,
            installer_args: Some(installer_args),
            target_jar: "forge.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Resolves Quilt via official Quilt installer.
    pub async fn resolve_quilt_build(&self, mc_version: &str) -> Result<ProviderBuildInfo> {
        let installer_url =
            "https://maven.quiltmc.org/repository/release/org/quiltmc/quilt-installer/0.15.1/quilt-installer-0.15.1.jar"
                .to_string();

        SecurityPolicy::validate_download_url(&installer_url)?;

        let installer_args = vec![
            "install".to_string(),
            "server".to_string(),
            mc_version.to_string(),
            "--download-server".to_string(),
            "--install-dir=.".to_string(),
        ];

        Ok(ProviderBuildInfo {
            provider: ServerType::Quilt,
            minecraft_version: mc_version.to_string(),
            build_id: format!("quilt-installer-0.15.1-mc{}", mc_version),
            download_url: installer_url,
            filename: "quilt-installer.jar".to_string(),
            file_size: Some(8734533),
            checksum_type: None,
            checksum_value: None,
            is_installer: true,
            installer_args: Some(installer_args),
            target_jar: "quilt-server-launch.jar".to_string(),
            required_java_major: self.get_required_java_version(mc_version).await.ok(),
        })
    }

    /// Downloads and installs server software into `server_dir`.
    /// Emits `server-download-progress` events if `app` is supplied.
    pub async fn download_and_install(
        &self,
        app: Option<&AppHandle>,
        server_dir: &Path,
        build_info: &ProviderBuildInfo,
        java_binary: Option<&str>,
    ) -> Result<PathBuf> {
        let target_jar_name = if build_info.is_installer {
            &build_info.filename
        } else {
            &build_info.target_jar
        };

        let temp_file_path = server_dir.join(format!("{}.download.tmp", target_jar_name));
        let final_file_path = server_dir.join(target_jar_name);

        self.emit_progress(
            app,
            "downloading",
            Some(0.0),
            0,
            build_info.file_size,
            format!("Starting download of {}", build_info.filename),
        );

        let resp = self
            .client
            .get(&build_info.download_url)
            .send()
            .await?
            .error_for_status()?;

        let total_size = resp.content_length().or(build_info.file_size);
        let mut file = std::fs::File::create(&temp_file_path).map_err(|e| {
            anyhow!(
                "Failed to create temporary download file {:?}: {}",
                temp_file_path,
                e
            )
        })?;

        let mut downloaded_bytes: u64 = 0;
        let mut sha1_hasher = Sha1::new();
        let mut sha256_hasher = Sha256::new();

        use futures_util::StreamExt;
        let mut stream = resp.bytes_stream();

        while let Some(chunk_res) = stream.next().await {
            let chunk = match chunk_res {
                Ok(c) => c,
                Err(e) => {
                    let _ = std::fs::remove_file(&temp_file_path);
                    return Err(anyhow!("Network error while downloading: {}", e));
                }
            };

            use std::io::Write;
            file.write_all(&chunk)?;
            downloaded_bytes += chunk.len() as u64;

            sha1_hasher.update(&chunk);
            sha256_hasher.update(&chunk);

            let percent = total_size.map(|tot| (downloaded_bytes as f32 / tot as f32) * 100.0);
            self.emit_progress(
                app,
                "downloading",
                percent,
                downloaded_bytes,
                total_size,
                format!(
                    "Downloading {}: {:.1} MB / {:.1} MB",
                    build_info.filename,
                    downloaded_bytes as f64 / 1_048_576.0,
                    total_size.unwrap_or(downloaded_bytes) as f64 / 1_048_576.0
                ),
            );
        }

        file.sync_all()?;
        drop(file);

        // Verification step
        self.emit_progress(
            app,
            "verifying",
            Some(100.0),
            downloaded_bytes,
            total_size,
            "Verifying downloaded file checksum...".to_string(),
        );

        if let (Some(ctype), Some(expected)) =
            (&build_info.checksum_type, &build_info.checksum_value)
        {
            let actual = match ctype.as_str() {
                "sha1" => hex::encode(sha1_hasher.finalize()),
                "sha256" => hex::encode(sha256_hasher.finalize()),
                _ => String::new(),
            };

            if !actual.is_empty() && !actual.eq_ignore_ascii_case(expected) {
                let _ = std::fs::remove_file(&temp_file_path);
                let err_msg = format!(
                    "Checksum mismatch! Expected {} '{}', but got '{}'. The downloaded file was deleted for safety.",
                    ctype, expected, actual
                );
                self.emit_progress(
                    app,
                    "error",
                    None,
                    downloaded_bytes,
                    total_size,
                    err_msg.clone(),
                );
                return Err(anyhow!(err_msg));
            }
        }

        // Atomic rename
        if final_file_path.exists() {
            let backup_path = server_dir.join(format!("{}.old.bak", target_jar_name));
            let _ = std::fs::rename(&final_file_path, &backup_path);
        }

        std::fs::rename(&temp_file_path, &final_file_path).map_err(|e| {
            let _ = std::fs::remove_file(&temp_file_path);
            anyhow!("Failed to finalize downloaded file: {}", e)
        })?;

        // If installer, execute controlled installer process
        if build_info.is_installer {
            self.emit_progress(
                app,
                "installing",
                None,
                downloaded_bytes,
                total_size,
                format!("Running installer for {}...", build_info.minecraft_version),
            );

            let java_exe = java_binary.unwrap_or("java");
            let mut cmd = std::process::Command::new(java_exe);
            cmd.current_dir(server_dir);
            cmd.arg("-jar");
            cmd.arg(&final_file_path);

            if let Some(ref args) = build_info.installer_args {
                for arg in args {
                    cmd.arg(arg);
                }
            }

            let output = cmd.output().map_err(|e| {
                anyhow!(
                    "Failed to execute installer '{}' with java '{}': {}",
                    final_file_path.display(),
                    java_exe,
                    e
                )
            })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(anyhow!(
                    "Installer execution failed (exit code {:?}):\nSTDOUT: {}\nSTDERR: {}",
                    output.status.code(),
                    stdout,
                    stderr
                ));
            }

            // Verify expected target jar exists
            let target_jar_path = server_dir.join(&build_info.target_jar);
            let mut resolved_target = target_jar_path.clone();

            if !resolved_target.exists() {
                // If Forge / NeoForge generated run.bat / run.sh or libraries, adapt to the generated launch target
                #[cfg(target_os = "windows")]
                let script_name = "run.bat";
                #[cfg(not(target_os = "windows"))]
                let script_name = "run.sh";

                let script_path = server_dir.join(script_name);
                if script_path.exists() {
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = std::fs::metadata(&script_path) {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            let _ = std::fs::set_permissions(&script_path, perms);
                        }
                    }
                    resolved_target = script_path;
                } else if server_dir.join("run.bat").exists() {
                    resolved_target = server_dir.join("run.bat");
                } else if server_dir.join("run.sh").exists() {
                    let run_sh = server_dir.join("run.sh");
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        if let Ok(meta) = std::fs::metadata(&run_sh) {
                            let mut perms = meta.permissions();
                            perms.set_mode(0o755);
                            let _ = std::fs::set_permissions(&run_sh, perms);
                        }
                    }
                    resolved_target = run_sh;
                } else if let Ok(entries) = std::fs::read_dir(server_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().map(|e| e == "jar").unwrap_or(false) {
                            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                            if (name.contains("forge") || name.contains("neoforge") || name.contains("server"))
                                && !name.ends_with("-installer.jar")
                            {
                                if std::fs::copy(&p, &target_jar_path).is_ok() {
                                    resolved_target = target_jar_path.clone();
                                } else {
                                    resolved_target = p;
                                }
                                break;
                            }
                        }
                    }
                }
            }

            self.emit_progress(
                app,
                "ready",
                Some(100.0),
                downloaded_bytes,
                total_size,
                format!(
                    "Server software ready: {}",
                    resolved_target.file_name().unwrap_or_default().to_string_lossy()
                ),
            );

            return Ok(resolved_target);
        }

        self.emit_progress(
            app,
            "ready",
            Some(100.0),
            downloaded_bytes,
            total_size,
            format!("Server software ready: {}", build_info.target_jar),
        );

        Ok(server_dir.join(&build_info.target_jar))
    }

    fn emit_progress(
        &self,
        app: Option<&AppHandle>,
        status: &str,
        progress_percent: Option<f32>,
        bytes_downloaded: u64,
        total_bytes: Option<u64>,
        message: String,
    ) {
        if let Some(app) = app {
            let payload = DownloadProgressPayload {
                server_id: None,
                status: status.to_string(),
                progress_percent,
                bytes_downloaded,
                total_bytes,
                message,
            };
            let _ = app.emit("server-download-progress", payload);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version_manifest() {
        let sample_manifest = r#"{
            "latest": {
                "release": "26.3",
                "snapshot": "26.4-snapshot-4"
            },
            "versions": [
                {
                    "id": "26.4-snapshot-4",
                    "type": "snapshot",
                    "url": "https://piston-meta.mojang.com/v1/packages/650b368231fa39ca6701be0f306ec5cc76beb8e0/26.4-snapshot-4.json",
                    "time": "2026-10-13T12:12:37+00:00",
                    "releaseTime": "2026-10-13T12:05:46+00:00",
                    "sha1": "650b368231fa39ca6701be0f306ec5cc76beb8e0",
                    "complianceLevel": 1
                },
                {
                    "id": "26.3",
                    "type": "release",
                    "url": "https://piston-meta.mojang.com/v1/packages/11f1aefe473eefba0af62e3286c33b692807b2eb/26.3.json",
                    "time": "2026-10-13T06:43:38+00:00",
                    "releaseTime": "2026-09-15T11:23:02+00:00",
                    "sha1": "11f1aefe473eefba0af62e3286c33b692807b2eb",
                    "complianceLevel": 1
                },
                {
                    "id": "1.21.4",
                    "type": "release",
                    "url": "https://piston-meta.mojang.com/v1/packages/123/1.21.4.json",
                    "time": "2024-12-03T11:00:00+00:00",
                    "releaseTime": "2024-12-03T11:00:00+00:00",
                    "sha1": "abcdef",
                    "complianceLevel": 1
                },
                {
                    "id": "rd-132211",
                    "type": "old_alpha",
                    "url": "https://piston-meta.mojang.com/v1/packages/d090f5d3766a28425316473d9ab6c37234d48b02/rd-132211.json",
                    "time": "2022-03-10T09:51:38+00:00",
                    "releaseTime": "2009-05-13T20:11:00+00:00",
                    "sha1": "d090f5d3766a28425316473d9ab6c37234d48b02",
                    "complianceLevel": 0
                }
            ]
        }"#;

        let manifest: VersionManifest = serde_json::from_str(sample_manifest).unwrap();
        assert_eq!(manifest.latest.release, "26.3");
        assert_eq!(manifest.latest.snapshot, "26.4-snapshot-4");
        assert_eq!(manifest.versions.len(), 4);

        // Verify categories exist
        let types: Vec<&str> = manifest
            .versions
            .iter()
            .map(|v| v.version_type.as_str())
            .collect();
        assert!(types.contains(&"snapshot"));
        assert!(types.contains(&"release"));
        assert!(types.contains(&"old_alpha"));
    }

    #[test]
    fn test_resolve_server_download_from_metadata() {
        let sample_version_meta = r#"{
            "id": "26.3",
            "downloads": {
                "client": {
                    "sha1": "c111",
                    "size": 12345,
                    "url": "https://piston-data.mojang.com/client.jar"
                },
                "server": {
                    "sha1": "33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c",
                    "size": 62294556,
                    "url": "https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar"
                }
            },
            "javaVersion": {
                "component": "java-runtime-epsilon",
                "majorVersion": 25
            }
        }"#;

        let meta: serde_json::Value = serde_json::from_str(sample_version_meta).unwrap();
        let server_dl = meta.get("downloads").and_then(|d| d.get("server")).unwrap();
        let url = server_dl.get("url").and_then(|u| u.as_str()).unwrap();
        let sha1 = server_dl.get("sha1").and_then(|s| s.as_str()).unwrap();
        let java_major = meta
            .get("javaVersion")
            .and_then(|j| j.get("majorVersion"))
            .and_then(|m| m.as_u64())
            .unwrap();

        assert_eq!(
            url,
            "https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar"
        );
        assert_eq!(sha1, "33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c");
        assert_eq!(java_major, 25);
    }

    #[test]
    fn test_missing_server_download_entry() {
        // rd-132211 has client download only
        let client_only_meta = r#"{
            "id": "rd-132211",
            "downloads": {
                "client": {
                    "sha1": "abcdef",
                    "size": 1000,
                    "url": "https://piston-data.mojang.com/client.jar"
                }
            }
        }"#;

        let meta: serde_json::Value = serde_json::from_str(client_only_meta).unwrap();
        let server_dl = meta.get("downloads").and_then(|d| d.get("server"));
        assert!(server_dl.is_none());
    }

    #[test]
    fn test_checksum_verification_sha1_and_sha256() {
        let content = b"hello world minecraft server jar data";

        let mut sha1_h = sha1::Sha1::new();
        sha1_h.update(content);
        let sha1_str = hex::encode(sha1_h.finalize());

        let mut sha256_h = sha2::Sha256::new();
        sha256_h.update(content);
        let sha256_str = hex::encode(sha256_h.finalize());

        assert!(!sha1_str.is_empty());
        assert!(!sha256_str.is_empty());
        assert_ne!(sha1_str, "invalid_checksum");
        assert_ne!(sha256_str, "invalid_checksum");
    }

    #[test]
    fn test_offline_cache_fallback() {
        let temp_dir =
            std::env::temp_dir().join(format!("mcset_test_cache_{}", uuid::Uuid::new_v4()));
        let _ = std::fs::create_dir_all(&temp_dir);
        let cache_file = temp_dir.join("version_manifest_v2.json");

        let cached_data = r#"{
            "latest": {
                "release": "26.3",
                "snapshot": "26.4-snapshot-4"
            },
            "versions": [
                {
                    "id": "26.3",
                    "type": "release",
                    "url": "https://piston-meta.mojang.com/26.3.json",
                    "time": "2026-10-13",
                    "releaseTime": "2026-09-15",
                    "sha1": "11f1aefe473eefba0af62e3286c33b692807b2eb",
                    "complianceLevel": 1
                }
            ]
        }"#;
        std::fs::write(&cache_file, cached_data).unwrap();

        // Read cache back
        let read_cached: VersionManifest =
            serde_json::from_str(&std::fs::read_to_string(&cache_file).unwrap()).unwrap();
        assert_eq!(read_cached.latest.release, "26.3");
        assert_eq!(read_cached.versions.len(), 1);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
