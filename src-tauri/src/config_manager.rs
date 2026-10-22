use crate::models::{ConfigDiff, ServerConfigItem};
use crate::security::SecurityPolicy;
use anyhow::Result;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct PropertyDefinition {
    pub key: &'static str,
    pub data_type: &'static str,
    pub category: &'static str,
    pub description: &'static str,
    pub default_val: &'static str,
    pub restart_required: bool,
    pub allowed_values: Option<&'static [&'static str]>,
}

pub const KNOWN_PROPERTIES: &[PropertyDefinition] = &[
    PropertyDefinition {
        key: "motd",
        data_type: "string",
        category: "General",
        description: "Server message displayed in the multiplayer server list.",
        default_val: "A Minecraft Server",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "server-port",
        data_type: "number",
        category: "Network",
        description: "The network port the server listens on (default 25565).",
        default_val: "25565",
        restart_required: true,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "max-players",
        data_type: "number",
        category: "General",
        description: "Maximum number of simultaneous players permitted on the server.",
        default_val: "20",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "gamemode",
        data_type: "select",
        category: "Gameplay",
        description: "Default game mode for new players entering the world.",
        default_val: "survival",
        restart_required: false,
        allowed_values: Some(&["survival", "creative", "adventure", "spectator"]),
    },
    PropertyDefinition {
        key: "difficulty",
        data_type: "select",
        category: "Gameplay",
        description: "The world difficulty determining hostile mob damage and hunger depletion.",
        default_val: "easy",
        restart_required: false,
        allowed_values: Some(&["peaceful", "easy", "normal", "hard"]),
    },
    PropertyDefinition {
        key: "pvp",
        data_type: "boolean",
        category: "Gameplay",
        description: "Enable or disable player versus player combat.",
        default_val: "true",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "hardcore",
        data_type: "boolean",
        category: "Gameplay",
        description: "Permanent death mode: players are set to spectator upon dying.",
        default_val: "false",
        restart_required: true,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "online-mode",
        data_type: "boolean",
        category: "Security",
        description: "Authenticates players with official Mojang account servers. Highly recommended.",
        default_val: "true",
        restart_required: true,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "white-list",
        data_type: "boolean",
        category: "Security",
        description: "When enabled, only players in whitelist.json can join.",
        default_val: "false",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "enforce-whitelist",
        data_type: "boolean",
        category: "Security",
        description: "Kicks connected players immediately if they are removed from the whitelist.",
        default_val: "false",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "view-distance",
        data_type: "number",
        category: "World",
        description: "Render distance sent to clients in chunks (range: 3 - 32).",
        default_val: "10",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "simulation-distance",
        data_type: "number",
        category: "World",
        description: "The distance around players where entities tick and crops grow (chunks).",
        default_val: "10",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "allow-flight",
        data_type: "boolean",
        category: "Gameplay",
        description: "Allows players to fly in Survival mode (required for some modded packs / jetpacks).",
        default_val: "false",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "spawn-monsters",
        data_type: "boolean",
        category: "World",
        description: "Controls whether hostile monsters can spawn naturally.",
        default_val: "true",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "spawn-animals",
        data_type: "boolean",
        category: "World",
        description: "Controls whether passive animals can spawn naturally.",
        default_val: "true",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "spawn-protection",
        data_type: "number",
        category: "World",
        description: "Radius in blocks of the protected world spawn zone where non-ops cannot build.",
        default_val: "16",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "level-name",
        data_type: "string",
        category: "World",
        description: "Name of the world directory folder.",
        default_val: "world",
        restart_required: true,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "level-seed",
        data_type: "string",
        category: "World",
        description: "World generation seed. Leave empty for a random seed.",
        default_val: "",
        restart_required: true,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "enable-command-block",
        data_type: "boolean",
        category: "Gameplay",
        description: "Enables execution of command blocks in game.",
        default_val: "false",
        restart_required: false,
        allowed_values: None,
    },
    PropertyDefinition {
        key: "network-compression-threshold",
        data_type: "number",
        category: "Network",
        description: "Packet size threshold in bytes before compression is applied.",
        default_val: "256",
        restart_required: true,
        allowed_values: None,
    },
];

pub struct ConfigManager;

impl ConfigManager {
    /// Reads and parses `server.properties` into rich `ServerConfigItem` models
    pub fn read_config(server_dir: &Path) -> Result<Vec<ServerConfigItem>> {
        let prop_path = server_dir.join("server.properties");
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &prop_path)?;

        let mut current_map: BTreeMap<String, String> = BTreeMap::new();

        if validated.exists() {
            let content = fs::read_to_string(&validated)?;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
                    continue;
                }
                if let Some(pos) = trimmed.find('=') {
                    let key = trimmed[..pos].trim().to_string();
                    let val = trimmed[pos + 1..].trim().to_string();
                    current_map.insert(key, val);
                }
            }
        }

        let mut items = Vec::new();

        // 1. Populate known properties first with full metadata
        for def in KNOWN_PROPERTIES {
            let val = current_map
                .remove(def.key)
                .unwrap_or_else(|| def.default_val.to_string());

            items.push(ServerConfigItem {
                key: def.key.to_string(),
                value: val,
                default_value: Some(def.default_val.to_string()),
                data_type: def.data_type.to_string(),
                category: def.category.to_string(),
                description: def.description.to_string(),
                restart_required: def.restart_required,
                allowed_values: def
                    .allowed_values
                    .map(|v| v.iter().map(|s| s.to_string()).collect()),
            });
        }

        // 2. Add any remaining custom or mod-added properties
        for (key, val) in current_map {
            let data_type = if val == "true" || val == "false" {
                "boolean"
            } else if val.chars().all(|c| c.is_ascii_digit()) {
                "number"
            } else {
                "string"
            };

            items.push(ServerConfigItem {
                key,
                value: val,
                default_value: None,
                data_type: data_type.to_string(),
                category: "Custom".to_string(),
                description: "Custom or server-specific property".to_string(),
                restart_required: true,
                allowed_values: None,
            });
        }

        Ok(items)
    }

    /// Computes diffs between current file and proposed key-value pairs
    pub fn propose_changes(
        server_dir: &Path,
        new_values: &BTreeMap<String, String>,
    ) -> Result<Vec<ConfigDiff>> {
        let current = Self::read_config(server_dir)?;
        let mut diffs = Vec::new();

        for (new_k, new_v) in new_values {
            if let Some(existing) = current.iter().find(|c| &c.key == new_k) {
                if &existing.value != new_v {
                    diffs.push(ConfigDiff {
                        key: new_k.clone(),
                        old_value: existing.value.clone(),
                        new_value: new_v.clone(),
                    });
                }
            } else {
                diffs.push(ConfigDiff {
                    key: new_k.clone(),
                    old_value: "".to_string(),
                    new_value: new_v.clone(),
                });
            }
        }

        Ok(diffs)
    }

    /// Applies updates to `server.properties`, preserving comments and unknown lines.
    /// Creates a backup file `server.properties.bak.<timestamp>` before saving!
    pub fn apply_changes(
        server_dir: &Path,
        updates: &BTreeMap<String, String>,
    ) -> Result<Vec<ConfigDiff>> {
        let prop_path = server_dir.join("server.properties");
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &prop_path)?;

        let diffs = Self::propose_changes(server_dir, updates)?;
        if diffs.is_empty() {
            return Ok(diffs);
        }

        // 1. If file exists, create a backup
        if validated.exists() {
            let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let backup_path = server_dir.join(format!("server.properties.bak.{}", now));
            fs::copy(&validated, &backup_path)?;
        }

        // 2. Read existing content preserving order and comments
        let mut updated_lines = Vec::new();
        let mut handled_keys = std::collections::HashSet::new();

        if validated.exists() {
            let content = fs::read_to_string(&validated)?;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('!') {
                    updated_lines.push(line.to_string());
                    continue;
                }
                if let Some(pos) = trimmed.find('=') {
                    let key = trimmed[..pos].trim();
                    if let Some(new_val) = updates.get(key) {
                        updated_lines.push(format!("{}={}", key, new_val));
                        handled_keys.insert(key.to_string());
                    } else {
                        updated_lines.push(line.to_string());
                        handled_keys.insert(key.to_string());
                    }
                } else {
                    updated_lines.push(line.to_string());
                }
            }
        } else {
            updated_lines.push("# Minecraft server properties".to_string());
            updated_lines.push(format!(
                "# Edited by MCSet on {}",
                chrono::Utc::now().to_rfc3339()
            ));
        }

        // 3. Append any newly added keys not previously present
        for (k, v) in updates {
            if !handled_keys.contains(k) {
                updated_lines.push(format!("{}={}", k, v));
            }
        }

        // 4. Atomic write using temporary file
        let tmp_path = server_dir.join(".server.properties.tmp");
        let new_content = updated_lines.join("\n") + "\n";
        fs::write(&tmp_path, new_content)?;
        fs::rename(&tmp_path, &validated)?;

        Ok(diffs)
    }

    /// Reads raw config file content safely
    pub fn read_raw(server_dir: &Path, file_name: &str) -> Result<String> {
        SecurityPolicy::validate_file_name(file_name)?;
        let file_path = server_dir.join(file_name);
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &file_path)?;
        if !validated.exists() {
            return Ok("".to_string());
        }
        let content = fs::read_to_string(validated)?;
        Ok(content)
    }

    /// Writes raw config file content safely with backup
    pub fn write_raw(server_dir: &Path, file_name: &str, content: &str) -> Result<()> {
        SecurityPolicy::validate_file_name(file_name)?;
        let file_path = server_dir.join(file_name);
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &file_path)?;

        if validated.exists() {
            let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let backup_path = server_dir.join(format!("{}.bak.{}", file_name, now));
            let _ = fs::copy(&validated, backup_path);
        }

        let tmp_path = server_dir.join(format!(".{}.tmp", file_name));
        fs::write(&tmp_path, content)?;
        fs::rename(tmp_path, validated)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_diff_and_comments_preservation() {
        let temp_dir =
            std::env::temp_dir().join(format!("mcset_test_cfg_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let initial_props =
            "# Generated by Minecraft\nmotd=Initial Server\nserver-port=25565\npvp=true\n";
        fs::write(temp_dir.join("server.properties"), initial_props).unwrap();

        let mut updates = BTreeMap::new();
        updates.insert("motd".to_string(), "Updated Awesome Server".to_string());
        updates.insert("difficulty".to_string(), "hard".to_string());

        let diffs = ConfigManager::apply_changes(&temp_dir, &updates).unwrap();
        assert_eq!(diffs.len(), 2);

        let final_content = fs::read_to_string(temp_dir.join("server.properties")).unwrap();
        assert!(final_content.contains("# Generated by Minecraft"));
        assert!(final_content.contains("motd=Updated Awesome Server"));
        assert!(final_content.contains("server-port=25565"));
        assert!(final_content.contains("difficulty=hard"));

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
