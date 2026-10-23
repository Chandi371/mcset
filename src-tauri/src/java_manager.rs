use anyhow::{Result, anyhow};
use futures_util::StreamExt;
use reqwest::Client;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};

use crate::models::{JavaRuntime, JdkDownloadProgress};
use crate::security::SecurityPolicy;

pub struct JavaManager;

impl JavaManager {
    /// Detects all installed Java runtimes on the system (Windows and Linux), including MCSet managed JDKs.
    pub fn detect_all_runtimes() -> Vec<JavaRuntime> {
        let mut found_paths = Vec::new();

        // 1. Check JAVA_HOME
        if let Ok(java_home) = std::env::var("JAVA_HOME") {
            let bin = Self::resolve_java_binary(Path::new(&java_home));
            if bin.exists() {
                found_paths.push(bin);
            }
        }

        // 2. Check PATH
        if let Ok(path_var) = std::env::var("PATH") {
            for entry in std::env::split_paths(&path_var) {
                let bin = Self::resolve_java_binary(&entry);
                if bin.exists() {
                    found_paths.push(bin);
                }
            }
        }

        // 3. Platform-specific well-known directories
        #[cfg(target_os = "windows")]
        {
            let roots = [
                r"C:\Program Files\Java",
                r"C:\Program Files\Eclipse Adoptium",
                r"C:\Program Files\BellSoft",
                r"C:\Program Files\Amazon Corretto",
                r"C:\Program Files\Zulu",
                r"C:\Program Files\Microsoft\jdk",
            ];
            for root in roots {
                let p = Path::new(root);
                if p.exists() {
                    if let Ok(entries) = std::fs::read_dir(p) {
                        for e in entries.flatten() {
                            let bin = Self::resolve_java_binary(&e.path());
                            if bin.exists() {
                                found_paths.push(bin);
                            }
                        }
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            let roots = ["/usr/lib/jvm", "/opt/java", "/usr/java"];
            for root in roots {
                let p = Path::new(root);
                if p.exists() {
                    if let Ok(entries) = std::fs::read_dir(p) {
                        for e in entries.flatten() {
                            let bin = Self::resolve_java_binary(&e.path());
                            if bin.exists() {
                                found_paths.push(bin);
                            }
                        }
                    }
                }
            }
            let default_bin = PathBuf::from("/usr/bin/java");
            if default_bin.exists() {
                found_paths.push(default_bin);
            }
        }

        // 4. MCSet internal managed Java runtimes (data_dir/java and ./java)
        if let Some(app_data) = dirs::data_dir() {
            let mcset_java = app_data.join("mcset").join("java");
            if mcset_java.exists() {
                if let Ok(entries) = std::fs::read_dir(&mcset_java) {
                    for e in entries.flatten() {
                        let bin = Self::resolve_java_binary(&e.path());
                        if bin.exists() {
                            found_paths.push(bin);
                        }
                    }
                }
            }
        }
        let local_java = Path::new("java");
        if local_java.exists() {
            if let Ok(entries) = std::fs::read_dir(local_java) {
                for e in entries.flatten() {
                    let bin = Self::resolve_java_binary(&e.path());
                    if bin.exists() {
                        found_paths.push(bin);
                    }
                }
            }
        }

        // Deduplicate paths
        let mut unique_paths = Vec::new();
        for p in found_paths {
            if let Ok(canonical) = p.canonicalize() {
                if !unique_paths.iter().any(|u: &PathBuf| u == &canonical) {
                    unique_paths.push(canonical);
                }
            } else if !unique_paths.iter().any(|u: &PathBuf| u == &p) {
                unique_paths.push(p);
            }
        }

        // Inspect each candidate binary
        let mut runtimes = Vec::new();
        for path in unique_paths {
            if let Some(runtime) = Self::inspect_java_binary(&path) {
                runtimes.push(runtime);
            }
        }

        // Sort by major version descending
        runtimes.sort_by(|a, b| b.major_version.cmp(&a.major_version));
        runtimes
    }

    pub fn resolve_java_binary(dir_or_bin: &Path) -> PathBuf {
        #[cfg(target_os = "windows")]
        let bin_name = "java.exe";
        #[cfg(not(target_os = "windows"))]
        let bin_name = "java";

        if dir_or_bin.is_file() {
            return dir_or_bin.to_path_buf();
        }

        let direct = dir_or_bin.join(bin_name);
        if direct.exists() {
            return direct;
        }

        let bin_dir = dir_or_bin.join("bin").join(bin_name);
        if bin_dir.exists() {
            return bin_dir;
        }

        // Check if extracted into a nested directory (e.g. jdk-21.0.12+1/bin/java or macOS Contents/Home/bin/java)
        let mac_direct = dir_or_bin.join("Contents").join("Home").join("bin").join(bin_name);
        if mac_direct.exists() {
            return mac_direct;
        }

        if let Ok(entries) = std::fs::read_dir(dir_or_bin) {
            for e in entries.flatten() {
                let sub = e.path();
                if sub.is_dir() {
                    let nested = sub.join("bin").join(bin_name);
                    if nested.exists() {
                        return nested;
                    }
                    let mac_nested = sub.join("Contents").join("Home").join("bin").join(bin_name);
                    if mac_nested.exists() {
                        return mac_nested;
                    }
                }
            }
        }

        dir_or_bin.join("bin").join(bin_name)
    }

    /// Inspects a java binary to get its version, vendor, and validity
    pub fn inspect_java_binary(path: &Path) -> Option<JavaRuntime> {
        let mut cmd = Command::new(path);
        cmd.arg("-version");

        // Suppress window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output().ok()?;

        // java -version writes to stderr!
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let combined = format!("{}\n{}", stderr, stdout);

        let (major, version_str) = Self::parse_version(&combined)?;
        let vendor = Self::parse_vendor(&combined);

        Some(JavaRuntime {
            path: path.to_string_lossy().to_string(),
            major_version: major,
            version_str,
            vendor,
            is_valid: true,
            is_recommended: major == 21 || major == 17 || major == 8,
        })
    }

    fn parse_version(output: &str) -> Option<(u32, String)> {
        for line in output.lines() {
            let lower = line.to_lowercase();
            if lower.contains("version \"") || lower.contains("openjdk ") || lower.contains("java ")
            {
                if let Some(start_q) = line.find('"') {
                    if let Some(end_q) = line[start_q + 1..].find('"') {
                        let ver_str = &line[start_q + 1..start_q + 1 + end_q];
                        let major = Self::extract_major(ver_str);
                        return Some((major, ver_str.to_string()));
                    }
                }

                for token in line.split_whitespace() {
                    if token.chars().next().map_or(false, |c| c.is_ascii_digit())
                        && token.contains('.')
                    {
                        let cleaned = token.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
                        let major = Self::extract_major(cleaned);
                        return Some((major, cleaned.to_string()));
                    }
                }
            }
        }
        None
    }

    fn extract_major(ver_str: &str) -> u32 {
        if ver_str.starts_with("1.") {
            let parts: Vec<&str> = ver_str.split('.').collect();
            if parts.len() > 1 {
                return parts[1].parse().unwrap_or(8);
            }
        }
        let first_num: String = ver_str.chars().take_while(|c| c.is_ascii_digit()).collect();
        first_num.parse().unwrap_or(0)
    }

    fn parse_vendor(output: &str) -> String {
        let lower = output.to_lowercase();
        if lower.contains("temurin") || lower.contains("adoptium") {
            "Eclipse Temurin".to_string()
        } else if lower.contains("zulu") {
            "Azul Zulu".to_string()
        } else if lower.contains("corretto") {
            "Amazon Corretto".to_string()
        } else if lower.contains("liberica") || lower.contains("bellsoft") {
            "BellSoft Liberica".to_string()
        } else if lower.contains("microsoft") {
            "Microsoft OpenJDK".to_string()
        } else if lower.contains("oracle") {
            "Oracle JDK".to_string()
        } else if lower.contains("openjdk") {
            "OpenJDK".to_string()
        } else {
            "Standard Java".to_string()
        }
    }

    /// Determines recommended Java version for a Minecraft release: (minimum_major, recommended_major)
    pub fn get_recommended_java_major(mc_version: &str) -> (u32, u32) {
        let parts: Vec<&str> = mc_version.split('.').collect();
        let first: u32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(1);
        let minor: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(21);
        let patch: u32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

        if first >= 26 {
            // Minecraft 26.x (e.g. 26.3, 26.4)
            (25, 25)
        } else if first == 1 && (minor >= 21 || (minor == 20 && patch >= 5)) {
            (21, 21) // 1.20.5+ requires Java 21
        } else if first == 1 && minor >= 17 {
            (17, 17) // 1.17 to 1.20.4 requires Java 17
        } else {
            (8, 17) // 1.16.5 and older
        }
    }

    /// Validates if a specific Java runtime is compatible with a Minecraft version
    pub fn validate_compatibility(java: &JavaRuntime, mc_version: &str) -> Result<()> {
        let (min_major, rec_major) = Self::get_recommended_java_major(mc_version);
        if java.major_version < min_major {
            return Err(anyhow!(
                "Java version incompatibility: Minecraft {} requires at least Java {}, but selected runtime is Java {} ({}).",
                mc_version,
                min_major,
                java.major_version,
                java.path
            ));
        }
        if java.major_version > rec_major + 3 {
            log::warn!(
                "Java {} is newer than recommended Java {} for MC {}",
                java.major_version,
                rec_major,
                mc_version
            );
        }
        Ok(())
    }

    /// Downloads and installs official portable Eclipse Temurin OpenJDK for the specified major version
    pub async fn download_and_install_jdk(
        data_dir: &Path,
        major_version: u32,
        app: Option<&AppHandle>,
    ) -> Result<JavaRuntime> {
        let java_dir = data_dir.join("java");
        std::fs::create_dir_all(&java_dir)?;

        #[cfg(target_os = "windows")]
        let os_name = "windows";
        #[cfg(target_os = "linux")]
        let os_name = "linux";
        #[cfg(target_os = "macos")]
        let os_name = "mac";

        #[cfg(target_arch = "x86_64")]
        let arch_name = "x64";
        #[cfg(target_arch = "aarch64")]
        let arch_name = "aarch64";

        let url = format!(
            "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jdk/hotspot/normal/eclipse",
            major_version, os_name, arch_name
        );

        let emit = |step: &str, percent: f32, downloaded: u64, total: u64| {
            if let Some(a) = app {
                let _ = a.emit(
                    "jdk-download-progress",
                    JdkDownloadProgress {
                        major_version,
                        step: step.to_string(),
                        percent,
                        downloaded_bytes: downloaded,
                        total_bytes: total,
                    },
                );
            }
        };

        emit("Connecting to Adoptium...", 5.0, 0, 0);

        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()?;

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to initiate JDK download from {}: {}", url, e))?;

        if !resp.status().is_success() {
            return Err(anyhow!(
                "Adoptium returned HTTP {} for JDK {}",
                resp.status(),
                major_version
            ));
        }

        let total_bytes = resp.content_length().unwrap_or(0);
        let tmp_archive = java_dir.join(format!(".tmp_jdk_{}.archive", major_version));
        let mut file = File::create(&tmp_archive)?;
        let mut downloaded: u64 = 0;

        let mut stream = resp.bytes_stream();
        while let Some(chunk_res) = stream.next().await {
            let chunk = chunk_res?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;

            let pct = if total_bytes > 0 {
                5.0 + (downloaded as f32 / total_bytes as f32) * 80.0
            } else {
                45.0
            };

            emit(
                "Downloading OpenJDK archive...",
                pct,
                downloaded,
                total_bytes,
            );
        }
        drop(file);

        emit("Extracting OpenJDK files...", 88.0, downloaded, total_bytes);

        let target_dir = java_dir.join(format!("jdk-{}", major_version));
        if target_dir.exists() {
            let _ = std::fs::remove_dir_all(&target_dir);
        }
        std::fs::create_dir_all(&target_dir)?;

        // Inspect header to detect tar.gz vs zip format
        let mut magic = [0u8; 2];
        {
            let mut f = File::open(&tmp_archive)?;
            let _ = f.read_exact(&mut magic);
        }

        if magic == [0x1F, 0x8B] {
            // Gzip compressed tarball (.tar.gz) used on Linux and macOS
            let tar_gz = File::open(&tmp_archive)?;
            let tar_stream = flate2::read::GzDecoder::new(tar_gz);
            let mut archive = tar::Archive::new(tar_stream);

            for entry_res in archive.entries()? {
                let mut entry = entry_res?;
                let path = entry.path()?.to_path_buf();

                // Strip root folder prefix (e.g. "jdk-21.0.13+9/")
                let mut components: Vec<_> = path.components().collect();
                if components.len() > 1 {
                    components.remove(0);
                    let relative_path: PathBuf = components.into_iter().collect();
                    let target_path = SecurityPolicy::validate_safe_relative_path(
                        &target_dir,
                        &relative_path.to_string_lossy(),
                    )?;

                    if entry.header().entry_type().is_dir() {
                        std::fs::create_dir_all(&target_path)?;
                    } else {
                        if let Some(p) = target_path.parent() {
                            std::fs::create_dir_all(p)?;
                        }
                        entry.unpack(&target_path)?;
                    }
                }
            }
        } else {
            // Zip archive format used on Windows
            let zip_file = File::open(&tmp_archive)?;
            let mut archive = zip::ZipArchive::new(zip_file)
                .map_err(|e| anyhow!("Invalid JDK zip archive: {}", e))?;

            // Detect common root prefix (e.g. "jdk-21.0.12+1/")
            let mut common_root: Option<String> = None;
            if archive.len() > 0 {
                let first_name = archive.by_index(0).ok().map(|e| e.name().to_string());
                if let Some(first_name) = first_name {
                    if let Some(root) = first_name.split('/').next() {
                        if !root.is_empty() && first_name.contains('/') {
                            let prefix = format!("{}/", root);
                            let mut all_match = true;
                            for i in 0..archive.len() {
                                if let Ok(e) = archive.by_index(i) {
                                    let n = e.name();
                                    if !n.starts_with(&prefix) && n != root {
                                        all_match = false;
                                        break;
                                    }
                                }
                            }
                            if all_match {
                                common_root = Some(prefix);
                            }
                        }
                    }
                }
            }

            for i in 0..archive.len() {
                let mut file = archive.by_index(i)?;
                let name = file.name().to_string();
                let stripped_name = if let Some(ref root) = common_root {
                    name.strip_prefix(root).unwrap_or(&name)
                } else {
                    &name
                };

                if stripped_name.is_empty() {
                    continue;
                }

                let target_path =
                    SecurityPolicy::validate_safe_relative_path(&target_dir, stripped_name)?;
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

        let _ = std::fs::remove_file(&tmp_archive);

        emit(
            "Verifying Java installation...",
            96.0,
            downloaded,
            total_bytes,
        );

        let java_bin = Self::resolve_java_binary(&target_dir);
        if !java_bin.exists() {
            return Err(anyhow!(
                "Failed to locate java binary in extracted JDK at {:?}",
                target_dir
            ));
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(&java_bin) {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&java_bin, perms);
            }
        }

        let runtime = Self::inspect_java_binary(&java_bin).ok_or_else(|| {
            anyhow!(
                "Installed Java binary at {:?} could not be validated",
                java_bin
            )
        })?;

        emit("Java ready!", 100.0, downloaded, total_bytes);

        Ok(runtime)
    }

    /// Checks for an existing runtime compatible with `mc_version`, or automatically installs one
    pub async fn find_or_install_compatible_java(
        data_dir: &Path,
        mc_version: &str,
        app: Option<&AppHandle>,
    ) -> Result<String> {
        let (min_major, rec_major) = Self::get_recommended_java_major(mc_version);
        let runtimes = Self::detect_all_runtimes();

        // 1. Try to find exact match for rec_major (e.g. Java 21 for 1.21.1)
        if let Some(matching) = runtimes.iter().find(|r| r.major_version == rec_major) {
            return Ok(matching.path.clone());
        }

        // 2. Try to find a compatible runtime within acceptable range (min_major ..= rec_major + 1)
        if let Some(compatible) = runtimes
            .iter()
            .find(|r| r.major_version >= min_major && r.major_version <= rec_major + 1)
        {
            return Ok(compatible.path.clone());
        }

        // 3. No compatible runtime found! Auto-install the recommended JDK
        log::info!(
            "No compatible Java runtime found for Minecraft {}. Auto-installing Java {}...",
            mc_version,
            rec_major
        );
        let runtime = Self::download_and_install_jdk(data_dir, rec_major, app).await?;
        Ok(runtime.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_major() {
        assert_eq!(JavaManager::extract_major("21.0.2"), 21);
        assert_eq!(JavaManager::extract_major("25.0.4.1"), 25);
        assert_eq!(JavaManager::extract_major("17.0.9"), 17);
        assert_eq!(JavaManager::extract_major("1.8.0_351"), 8);
    }

    #[test]
    fn test_recommended_java() {
        assert_eq!(JavaManager::get_recommended_java_major("26.3"), (25, 25));
        assert_eq!(JavaManager::get_recommended_java_major("1.21.4"), (21, 21));
        assert_eq!(JavaManager::get_recommended_java_major("1.20.6"), (21, 21));
        assert_eq!(JavaManager::get_recommended_java_major("1.20.4"), (17, 17));
        assert_eq!(JavaManager::get_recommended_java_major("1.19.2"), (17, 17));
        assert_eq!(JavaManager::get_recommended_java_major("1.16.5"), (8, 17));
    }
}
