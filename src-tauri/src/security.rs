use anyhow::{Result, anyhow};
use std::path::{Path, PathBuf};

pub struct SecurityPolicy;

impl SecurityPolicy {
    /// Strips Windows verbatim prefix (`\\?\` or `\\?\UNC\`) for safe path comparisons
    fn normalize_path(path: &Path) -> PathBuf {
        let s = path.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\UNC\") {
            PathBuf::from(format!(r"\\{}", stripped))
        } else if let Some(stripped) = s.strip_prefix(r"\\?\") {
            PathBuf::from(stripped)
        } else {
            path.to_path_buf()
        }
    }

    /// Validates that `target_path` is strictly within `allowed_root`.
    /// Protects against directory traversal attacks like `../../etc/passwd`.
    pub fn validate_path_within_root(allowed_root: &Path, target_path: &Path) -> Result<PathBuf> {
        let raw_canonical_root = allowed_root
            .canonicalize()
            .map_err(|e| anyhow!("Failed to resolve root path {:?}: {}", allowed_root, e))?;
        let canonical_root = Self::normalize_path(&raw_canonical_root);

        // If target doesn't exist yet, validate its nearest existing ancestor
        let canonical_target = if target_path.exists() {
            let canon = target_path
                .canonicalize()
                .map_err(|e| anyhow!("Failed to resolve target path {:?}: {}", target_path, e))?;
            Self::normalize_path(&canon)
        } else {
            let mut ancestors = target_path.ancestors();
            ancestors.next(); // skip self
            let mut existing_parent = None;
            for parent in ancestors {
                if parent.exists() {
                    let canon = parent.canonicalize()?;
                    existing_parent = Some(Self::normalize_path(&canon));
                    break;
                }
            }
            match existing_parent {
                Some(p) => {
                    if !p.starts_with(&canonical_root) {
                        return Err(anyhow!(
                            "Security violation: path traversal detected outside server directory"
                        ));
                    }
                    Self::normalize_path(target_path)
                }
                None => {
                    return Err(anyhow!(
                        "Cannot resolve valid parent directory for target path"
                    ));
                }
            }
        };

        if !canonical_target.starts_with(&canonical_root) {
            return Err(anyhow!(
                "Security violation: path traversal attempt outside allowed boundary: {:?}",
                target_path
            ));
        }

        Ok(canonical_target)
    }

    /// Validates server name
    pub fn validate_server_name(name: &str) -> Result<()> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(anyhow!("Server name cannot be empty"));
        }
        if trimmed.len() > 100 {
            return Err(anyhow!("Server name must be 100 characters or fewer"));
        }
        for c in trimmed.chars() {
            if !(c.is_alphanumeric()
                || c == ' '
                || c == '-'
                || c == '_'
                || c == '.'
                || c == '['
                || c == ']'
                || c == '('
                || c == ')'
                || c == '+'
                || c == '&'
                || c == '\''
                || c == '!'
                || c == ':')
            {
                return Err(anyhow!("Server name contains invalid character: '{}'.", c));
            }
        }
        Ok(())
    }

    /// Validates port number
    pub fn validate_port(port: u16) -> Result<()> {
        if port < 1024 {
            return Err(anyhow!("Port {} is restricted (< 1024)", port));
        }
        Ok(())
    }

    /// Validates memory bounds (in MB)
    pub fn validate_memory(min_ram_mb: u32, max_ram_mb: u32) -> Result<()> {
        if min_ram_mb < 512 {
            return Err(anyhow!("Minimum RAM must be at least 512 MB"));
        }
        if max_ram_mb < min_ram_mb {
            return Err(anyhow!(
                "Maximum RAM ({} MB) cannot be less than minimum RAM ({} MB)",
                max_ram_mb,
                min_ram_mb
            ));
        }
        if max_ram_mb > 1048576 {
            // 1024 GB (1 TB) safety ceiling for massive servers
            return Err(anyhow!(
                "Maximum RAM ({} MB) exceeds safety limit of 1024 GB (1 TB)",
                max_ram_mb
            ));
        }
        Ok(())
    }

    /// Validates safe file name (no path separators, no `..`)
    pub fn validate_file_name(file_name: &str) -> Result<()> {
        if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
            return Err(anyhow!("File name contains invalid path traversal tokens"));
        }
        Ok(())
    }

    /// Normalizes an incoming relative path string across Windows (`\`) and Unix (`/`) separators.
    /// Decomposes into canonical path segments, skips redundant empty or current-directory ('.') segments,
    /// strictly rejects path traversal ('..') and absolute/drive prefixes, and builds a platform-native PathBuf.
    pub fn normalize_relative_path(rel_path: &str) -> Result<PathBuf> {
        let trimmed = rel_path.trim();
        if trimmed.is_empty() {
            return Err(anyhow!("Relative path cannot be empty"));
        }
        let uniform = trimmed.replace('\\', "/");
        if uniform.starts_with('/') || uniform.contains(':') {
            return Err(anyhow!(
                "Absolute or drive-prefixed paths are not permitted: {}",
                rel_path
            ));
        }

        let mut buf = PathBuf::new();
        for segment in uniform.split('/') {
            let seg = segment.trim();
            if seg.is_empty() || seg == "." {
                continue;
            }
            if seg == ".." {
                return Err(anyhow!(
                    "Path traversal token '..' detected in: {}",
                    rel_path
                ));
            }
            buf.push(seg);
        }

        if buf.as_os_str().is_empty() {
            return Err(anyhow!("Normalized relative path is empty: {}", rel_path));
        }
        Ok(buf)
    }

    /// Resolves and validates a relative path inside a target base directory.
    /// Normalizes mixed slashes ('/' vs '\\') into a platform-native PathBuf and verifies boundary confinement.
    pub fn validate_safe_relative_path(
        base_dir: &std::path::Path,
        rel_path: &str,
    ) -> Result<std::path::PathBuf> {
        let normalized = Self::normalize_relative_path(rel_path)?;
        let target = base_dir.join(normalized);
        // Ensure that the target starts with base_dir
        if !target.starts_with(base_dir) {
            return Err(anyhow!(
                "Path escapes designated server boundary: {}",
                rel_path
            ));
        }
        Ok(target)
    }

    /// Resolves an incoming relative path within the server directory using path normalization and root boundary checks.
    pub fn resolve_server_relative_path(
        server_dir: &std::path::Path,
        rel_path: &str,
    ) -> Result<std::path::PathBuf> {
        let safe_target = Self::validate_safe_relative_path(server_dir, rel_path)?;
        Self::validate_path_within_root(server_dir, &safe_target)
    }

    /// Returns a standardized forward-slash relative path string (e.g. for API/JSON responses)
    pub fn normalize_relative_path_string(rel_path: &str) -> Result<String> {
        let buf = Self::normalize_relative_path(rel_path)?;
        let mut parts = Vec::new();
        for comp in buf.components() {
            if let std::path::Component::Normal(c) = comp {
                parts.push(c.to_string_lossy().to_string());
            }
        }
        Ok(parts.join("/"))
    }

    /// Validates that a download URL comes from an official or verified provider domain
    pub fn validate_download_url(url_str: &str) -> Result<()> {
        let parsed = url::Url::parse(url_str).map_err(|e| anyhow!("Invalid URL format: {}", e))?;
        if parsed.scheme() != "https" {
            return Err(anyhow!(
                "Security violation: only HTTPS downloads are allowed"
            ));
        }
        let host = parsed
            .host_str()
            .ok_or_else(|| anyhow!("URL missing host"))?;

        const ALLOWED_SUFFIXES: &[&str] = &[
            "mojang.com",
            "minecraft.net",
            "papermc.io",
            "fabricmc.net",
            "minecraftforge.net",
            "neoforged.net",
            "quiltmc.org",
            "modrinth.com",
            "curseforge.com",
            "cursecdn.com",
            "forgecdn.net",
            "gitlab.com",
            "gosunuts.xyz",
            "s-h.day",
            "kakashit.org",
            "github.com",
            "githubusercontent.com",
        ];

        let is_allowed = ALLOWED_SUFFIXES
            .iter()
            .any(|suffix| host == *suffix || host.ends_with(&format!(".{}", suffix)));

        if !is_allowed {
            return Err(anyhow!(
                "Security violation: download host '{}' is not an authorized official software provider",
                host
            ));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_name_validation() {
        assert!(SecurityPolicy::validate_server_name("My Survival Server").is_ok());
        assert!(SecurityPolicy::validate_server_name("paper-1.21.4_prod").is_ok());
        assert!(
            SecurityPolicy::validate_server_name("Cobblemon Official Modpack [Fabric]").is_ok()
        );
        assert!(SecurityPolicy::validate_server_name("All the Mods 9 (ATM9)").is_ok());
        assert!(SecurityPolicy::validate_server_name("").is_err());
        assert!(SecurityPolicy::validate_server_name("server/../hack").is_err());
        assert!(SecurityPolicy::validate_server_name("server; rm -rf").is_err());
    }

    #[test]
    fn test_memory_validation() {
        assert!(SecurityPolicy::validate_memory(1024, 4096).is_ok());
        assert!(SecurityPolicy::validate_memory(1024, 65536).is_ok()); // 64 GB
        assert!(SecurityPolicy::validate_memory(1024, 524288).is_ok()); // 512 GB custom
        assert!(SecurityPolicy::validate_memory(256, 1024).is_err()); // < 512
        assert!(SecurityPolicy::validate_memory(4096, 2048).is_err()); // min > max
        assert!(SecurityPolicy::validate_memory(1024, 2000000).is_err()); // > 1TB
    }

    #[test]
    fn test_safe_relative_path() {
        let base = std::path::PathBuf::from("C:\\server_root");
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "mods/jei.jar").is_ok());
        assert!(
            SecurityPolicy::validate_safe_relative_path(&base, "plugins\\ViaVersion.jar").is_ok()
        );
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "config/sub/test.toml").is_ok());
        assert!(
            SecurityPolicy::validate_safe_relative_path(&base, ".\\config\\nested/test.yml")
                .is_ok()
        );
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "../outside.txt").is_err());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "mods/../../hack.exe").is_err());
        assert!(SecurityPolicy::validate_safe_relative_path(&base, "/etc/passwd").is_err());
        assert!(
            SecurityPolicy::validate_safe_relative_path(&base, "C:\\Windows\\System32").is_err()
        );

        let normalized =
            SecurityPolicy::normalize_relative_path_string(r"plugins\ViaVersion\config.yml")
                .unwrap();
        assert_eq!(normalized, "plugins/ViaVersion/config.yml");
    }

    #[test]
    fn test_port_validation() {
        assert!(SecurityPolicy::validate_port(25565).is_ok());
        assert!(SecurityPolicy::validate_port(80).is_err());
    }

    #[test]
    fn test_download_url_validation() {
        assert!(
            SecurityPolicy::validate_download_url(
                "https://piston-data.mojang.com/v1/objects/123/server.jar"
            )
            .is_ok()
        );
        assert!(
            SecurityPolicy::validate_download_url(
                "https://fill-data.papermc.io/v1/objects/123/paper.jar"
            )
            .is_ok()
        );
        assert!(SecurityPolicy::validate_download_url("https://maven.fabricmc.net/net/fabricmc/fabric-installer/1.1.2/fabric-installer-1.1.2.jar").is_ok());
        assert!(SecurityPolicy::validate_download_url("https://maven.neoforged.net/releases/net/neoforged/neoforge/21.4.111-beta/neoforge.jar").is_ok());
        assert!(
            SecurityPolicy::validate_download_url(
                "https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1/forge.jar"
            )
            .is_ok()
        );
        assert!(
            SecurityPolicy::validate_download_url(
                "https://maven.quiltmc.org/repository/release/quilt.jar"
            )
            .is_ok()
        );

        // Disallowed
        assert!(
            SecurityPolicy::validate_download_url("http://piston-data.mojang.com/insecure.jar")
                .is_err()
        );
        assert!(
            SecurityPolicy::validate_download_url("https://malicious-mirror.com/server.jar")
                .is_err()
        );
        assert!(SecurityPolicy::validate_download_url("not-a-url").is_err());
    }
}
