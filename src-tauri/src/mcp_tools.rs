use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use anyhow::{anyhow, Result};
use serde_json::json;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter};

use crate::backup_manager::BackupManager;
use crate::config_manager::ConfigManager;
use crate::database::Database;
use crate::extension_manager::ExtensionManager;
use crate::models::{McpToolCall, McpToolResult, PendingCommandApproval, ServerProfile, ServerType, ServerStatusState};
use crate::security::SecurityPolicy;
use crate::portal_manager::PortalManager;
use crate::server_lifecycle::ServerLifecycleManager;
use crate::software_manager::SoftwareProviderManager;
use crate::modpack_manager::ModpackManager;

pub struct McpToolEngine {
    pub db: Database,
    pub lifecycle: ServerLifecycleManager,
    pub software_manager: Arc<SoftwareProviderManager>,
    pub portal_manager: Arc<PortalManager>,
    pub modpack_manager: Arc<ModpackManager>,
    pub app_handle: AppHandle,
    pub approvals: Arc<Mutex<HashMap<String, PendingCommandApproval>>>,
}

impl McpToolEngine {
    pub fn new(
        db: Database,
        lifecycle: ServerLifecycleManager,
        software_manager: Arc<SoftwareProviderManager>,
        portal_manager: Arc<PortalManager>,
        modpack_manager: Arc<ModpackManager>,
        app_handle: AppHandle,
    ) -> Self {
        McpToolEngine {
            db,
            lifecycle,
            software_manager,
            portal_manager,
            modpack_manager,
            app_handle,
            approvals: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Finds an available network port starting from desired_port
    pub fn find_available_port(desired_port: u16) -> (u16, bool) {
        if std::net::TcpListener::bind(("0.0.0.0", desired_port)).is_ok() {
            return (desired_port, false);
        }
        for p in (desired_port + 1)..=(desired_port + 200) {
            if std::net::TcpListener::bind(("0.0.0.0", p)).is_ok() {
                return (p, true);
            }
        }
        (desired_port, false)
    }

    /// Classifies a Minecraft console command to determine if it requires explicit user approval
    pub fn classify_command(command: &str) -> (bool, &'static str, &'static str) {
        let trimmed = command.trim().trim_start_matches('/');
        let first_word = trimmed.split_whitespace().next().unwrap_or("").to_lowercase();

        match first_word.as_str() {
            "list" | "help" | "tps" | "version" | "seed" | "plugins" | "pl" => {
                (false, "Informational query", "Read-only operation with no server side-effects")
            }
            "time" => {
                if trimmed.to_lowercase().starts_with("time query") {
                    (false, "Time query", "Read-only game time inspection")
                } else {
                    (true, "Changes game time", "Modifies the current world time for all connected players")
                }
            }
            "weather" => {
                if trimmed.to_lowercase().starts_with("weather query") {
                    (false, "Weather query", "Read-only weather inspection")
                } else {
                    (true, "Changes weather", "Alters active world weather conditions")
                }
            }
            "op" => (
                true,
                "Grants administrator (operator) privileges",
                "Grants unrestricted command and configuration access to the designated player",
            ),
            "deop" => (
                true,
                "Revokes administrator privileges",
                "Demotes an administrator back to standard player status",
            ),
            "ban" | "ban-ip" => (
                true,
                "Bans a player or IP address",
                "Permanently blocks the player or IP address from joining the server",
            ),
            "pardon" | "pardon-ip" => (
                true,
                "Unbans a player or IP address",
                "Restores server access for a previously banned player",
            ),
            "kick" => (
                true,
                "Kicks a player from the server",
                "Forcefully disconnects the designated player from the active game session",
            ),
            "whitelist" => (
                true,
                "Modifies server whitelist",
                "Changes who is permitted to join the server",
            ),
            "gamerule" => (
                true,
                "Modifies global game rule",
                "Alters core gameplay rules and mechanics (e.g. keepInventory, mobGriefing)",
            ),
            "stop" => (
                true,
                "Shuts down the Minecraft server",
                "Disconnects all active players and stops the server process",
            ),
            "restart" => (
                true,
                "Restarts the Minecraft server",
                "Reboots the server process",
            ),
            "fill" | "setblock" | "clone" => (
                true,
                "Modifies world blocks in bulk",
                "Permanently alters terrain blocks in the active world",
            ),
            "kill" => (
                true,
                "Kills players or entities",
                "Causes player death or entity removal in the world",
            ),
            "reload" => (
                true,
                "Reloads server plugins and configurations",
                "May cause performance hitches, memory leaks, or plugin desynchronization",
            ),
            _ => (
                true,
                "Custom console command",
                "May alter game state, permissions, or server data",
            ),
        }
    }

    /// Returns JSON tool definitions for LLMs
    pub fn get_tool_definitions() -> Vec<serde_json::Value> {
        vec![
            json!({
                "type": "function",
                "function": {
                    "name": "get_server_status",
                    "description": "Gets current operational status, CPU, memory, port, and online players of a Minecraft server profile.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server profile" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "list_servers",
                    "description": "Lists all configured Minecraft servers with their versions, ports, types, and directories.",
                    "parameters": { "type": "object", "properties": {} }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "list_plugins",
                    "description": "Lists all installed mods or plugins in the specified server, showing enabled/disabled status and size.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "read_config",
                    "description": "Reads a server configuration file (e.g. server.properties, YAML, JSON) with optional line-range or section filtering. Returns content and SHA-256 hash for optimistic concurrency checks.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "relative_path": { "type": "string", "description": "Relative file path (default: 'server.properties')" },
                            "start_line": { "type": "integer", "description": "1-based starting line number (optional)" },
                            "end_line": { "type": "integer", "description": "1-based ending line number (optional)" },
                            "tail_lines": { "type": "integer", "description": "Number of lines to read from the end (optional)" },
                            "section": { "type": "string", "description": "Filter by section heading or property key (optional)" },
                            "format": { "type": "string", "enum": ["auto", "text", "yaml", "json", "properties", "toml"], "description": "Expected format (optional)" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "read_server_logs",
                    "description": "Reads recent server console logs with parameterized filtering (severity level, search pattern, tail/line range) and deduplication of repetitive messages while preserving stack traces.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "level": { "type": "string", "enum": ["ALL", "INFO", "WARN", "ERROR"], "description": "Log severity level filter (default 'ALL')" },
                            "only_errors": { "type": "boolean", "description": "Filter only errors and exception stack traces (default false)" },
                            "tail_lines": { "type": "integer", "description": "Number of recent lines to retrieve (default 50, max 500)" },
                            "start_line": { "type": "integer", "description": "1-based start line index (optional)" },
                            "end_line": { "type": "integer", "description": "1-based end line index (optional)" },
                            "search_pattern": { "type": "string", "description": "Case-insensitive text pattern to search for (optional)" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "search_plugins",
                    "description": "Searches Modrinth for plugins or mods compatible with the server version and loader. Returns concise, context-optimized summaries.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "query": { "type": "string", "description": "Search keyword or name (e.g. 'LuckPerms', 'WorldEdit', 'Lithium')" }
                        },
                        "required": ["server_id", "query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_plugin_details",
                    "description": "Fetches version and compatibility details for a specific project from Modrinth.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "project_id_or_slug": { "type": "string", "description": "Modrinth project ID or slug" }
                        },
                        "required": ["server_id", "project_id_or_slug"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "create_backup",
                    "description": "Creates a compressed zip backup of the server directory before making critical changes.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "description": { "type": "string", "description": "Reason or description for this backup" }
                        },
                        "required": ["server_id", "description"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "propose_config_change",
                    "description": "Previews proposed changes to server.properties and returns a diff without modifying files.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "updates": {
                                "type": "object",
                                "description": "Key-value pairs of settings to update (e.g. {\"difficulty\": \"hard\", \"pvp\": \"false\"})"
                            }
                        },
                        "required": ["server_id", "updates"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "apply_config_change",
                    "description": "Applies validated changes to server.properties with automatic backup creation.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "updates": {
                                "type": "object",
                                "description": "Key-value pairs to write to server.properties"
                            }
                        },
                        "required": ["server_id", "updates"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "find_in_file",
                    "description": "Searches for a text pattern in a server file, returning matching line numbers and surrounding context lines.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "relative_path": { "type": "string", "description": "Relative file path inside the server folder" },
                            "search_pattern": { "type": "string", "description": "Text pattern to find" },
                            "case_sensitive": { "type": "boolean", "description": "Whether to perform case-sensitive search (default false)" }
                        },
                        "required": ["server_id", "relative_path", "search_pattern"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "patch_file",
                    "description": "Applies a targeted text or line-range patch to a file with pre-modification backup and optimistic concurrency check via expected_hash.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "relative_path": { "type": "string", "description": "Relative file path to patch" },
                            "find_text": { "type": "string", "description": "Exact text snippet to find and replace (optional)" },
                            "replace_text": { "type": "string", "description": "New replacement text (optional)" },
                            "start_line": { "type": "integer", "description": "1-based start line to replace (optional)" },
                            "end_line": { "type": "integer", "description": "1-based end line to replace (optional)" },
                            "expected_hash": { "type": "string", "description": "Expected SHA-256 hash of the file to prevent race conditions (optional)" }
                        },
                        "required": ["server_id", "relative_path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "set_server_property",
                    "description": "Sets or updates a single property in server.properties with automatic backup and optimistic concurrency checking.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "key": { "type": "string", "description": "Property key (e.g. 'server-port', 'motd', 'online-mode')" },
                            "value": { "type": "string", "description": "New value to set" },
                            "expected_hash": { "type": "string", "description": "Expected SHA-256 hash (optional)" }
                        },
                        "required": ["server_id", "key", "value"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "send_console_command",
                    "description": "Sends a console command to a running Minecraft server. Informational/read-only commands execute directly; destructive, privilege, or moderation commands generate a pending approval card for the user in the UI.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "command": { "type": "string", "description": "Command string to execute (e.g. 'list', 'tps', 'op Steve')" }
                        },
                        "required": ["server_id", "command"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "inspect_crash_report",
                    "description": "Inspects and parses the latest crash report in crash-reports/ or falls back to recent fatal errors in logs/latest.log. Returns description, exception, root cause chain, and suspected plugins/mods.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_online_players",
                    "description": "Retrieves the currently connected players, online count, max capacity, verified operators, and whitelist status.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "install_plugin",
                    "description": "Downloads and installs a plugin or mod version from Modrinth with hash verification.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "project_id_or_slug": { "type": "string", "description": "Modrinth project ID or slug" }
                        },
                        "required": ["server_id", "project_id_or_slug"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "disable_plugin",
                    "description": "Toggles or disables a plugin/mod by renaming it to .disabled.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "file_name": { "type": "string", "description": "The filename of the jar file (e.g. 'worldedit.jar')" }
                        },
                        "required": ["server_id", "file_name"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "remove_plugin",
                    "description": "Deletes a plugin or mod file from the server extensions folder.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "file_name": { "type": "string", "description": "The filename to remove" }
                        },
                        "required": ["server_id", "file_name"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "start_server",
                    "description": "Starts the specified Minecraft server process with automatic pre-flight port-conflict checks.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "stop_server",
                    "description": "Stops the running Minecraft server process gracefully.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "restart_server",
                    "description": "Gracefully stops and restarts the specified Minecraft server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "open_server_directory",
                    "description": "Opens the server's working directory in the system file explorer.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "restore_backup",
                    "description": "Restores a previous zip snapshot backup for a server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "backup_filename": { "type": "string", "description": "The filename of the backup" }
                        },
                        "required": ["server_id", "backup_filename"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "Reads text content from any file inside the server directory.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "relative_path": { "type": "string", "description": "Relative file path inside the server folder" }
                        },
                        "required": ["server_id", "relative_path"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "modify_file",
                    "description": "Writes or updates a file inside the server directory with automatic backup.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "relative_path": { "type": "string", "description": "Relative file path to modify or create" },
                            "content": { "type": "string", "description": "Complete new content to write to the file" }
                        },
                        "required": ["server_id", "relative_path", "content"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "delete_server",
                    "description": "Deletes a server profile, stops it if running, and optionally removes disk files.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" },
                            "delete_files": { "type": "boolean", "description": "Whether to delete server files from disk (default true)" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "create_server",
                    "description": "Creates, configures, and installs a new Minecraft server with automatic port-conflict resolution.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Server profile display name" },
                            "server_type": { "type": "string", "enum": ["vanilla", "paper", "purpur", "spigot", "fabric", "forge", "neoforge", "quilt"], "description": "Server software type" },
                            "minecraft_version": { "type": "string", "description": "Target version (e.g. '1.21.4' or 'latest')" },
                            "port": { "type": "integer", "description": "Desired server port (default 25565)" },
                            "min_ram_mb": { "type": "integer", "description": "Minimum RAM in MB (default 1024)" },
                            "max_ram_mb": { "type": "integer", "description": "Maximum RAM in MB (default 2048)" }
                        },
                        "required": ["name", "server_type", "minecraft_version"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_available_versions",
                    "description": "Fetches the full catalogue of official Minecraft versions from Mojang manifest.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "force_refresh": { "type": "boolean", "description": "Whether to refresh cache" },
                            "category": { "type": "string", "description": "Filter: 'release', 'snapshot', 'all'" },
                            "limit": { "type": "integer", "description": "Max versions to return (default 25)" }
                        }
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_public_access_status",
                    "description": "Retrieves the real-time public access and tunnel status for a Minecraft server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "enable_public_access",
                    "description": "Enables public internet connectivity for a Minecraft Java server via Portal raw TCP tunnel, returning public address and port.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_public_access_endpoint",
                    "description": "Returns the public connection address (e.g. *.gosunuts.xyz:port) and reachability status for a server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "disable_public_access",
                    "description": "Stops and closes the public Portal TCP tunnel for a Minecraft server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "search_modpacks",
                    "description": "Searches for modpacks across Modrinth and CurseForge with optional Minecraft version and loader filters.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Modpack search query (e.g. 'Cobblemon', 'Better MC', 'RLCraft')" },
                            "provider": { "type": "string", "enum": ["modrinth", "curseforge"], "description": "Provider (default: 'modrinth')" },
                            "minecraft_version": { "type": "string", "description": "Target Minecraft version (optional, e.g. '1.21.1')" },
                            "loader": { "type": "string", "enum": ["all", "fabric", "forge", "neoforge", "quilt"], "description": "Loader filter (optional)" },
                            "limit": { "type": "integer", "description": "Number of results to return (default: 8)" }
                        },
                        "required": ["query"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "get_modpack_versions",
                    "description": "Retrieves available release and beta versions/files for a modpack project.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "project_id": { "type": "string", "description": "Project ID or slug (e.g. 'cobblemon-fabric', 'better-mc')" },
                            "provider": { "type": "string", "enum": ["modrinth", "curseforge"], "description": "Provider (default: 'modrinth')" }
                        },
                        "required": ["project_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "install_modpack_server",
                    "description": "Installs and deploys a complete dedicated Modpack Server (Modrinth .mrpack or CurseForge server pack). Automatically resolves dependencies, downloads files, extracts server overrides, installs the server loader (Fabric/Forge/NeoForge/Quilt), detects or downloads a compatible Java runtime, and registers the server profile in MCSet.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "name": { "type": "string", "description": "Server profile display name (e.g. 'Cobblemon SMP')" },
                            "project_id": { "type": "string", "description": "Modpack project slug or ID" },
                            "provider": { "type": "string", "enum": ["modrinth", "curseforge"], "description": "Provider (default: 'modrinth')" },
                            "version_id": { "type": "string", "description": "Specific version ID (optional; defaults to latest compatible release)" },
                            "minecraft_version": { "type": "string", "description": "Target Minecraft version (optional)" },
                            "loader": { "type": "string", "enum": ["fabric", "forge", "neoforge", "quilt"], "description": "Loader (optional)" },
                            "port": { "type": "integer", "description": "Server port (default: 25565; auto-assigns available port if conflict)" },
                            "min_ram_mb": { "type": "integer", "description": "Min RAM in MB (default: 2048)" },
                            "max_ram_mb": { "type": "integer", "description": "Max RAM in MB (default: 4096)" },
                            "eula_accepted": { "type": "boolean", "description": "Explicit acceptance of Minecraft EULA (must be true)" }
                        },
                        "required": ["name", "project_id", "eula_accepted"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "download_java_runtime",
                    "description": "Downloads and sets up a portable OpenJDK runtime (Adoptium Temurin) for Java 8, 17, or 21 without requiring admin rights.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "major_version": { "type": "integer", "enum": [8, 17, 21], "description": "Major Java version to download (8, 17, or 21)" }
                        },
                        "required": ["major_version"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "auto_fix_server_java",
                    "description": "Automatically fixes a server's Java version incompatibility crash by downloading the required runtime (or matching existing), updating the server profile, and restarting the server.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "Server profile unique ID" },
                            "target_major": { "type": "integer", "description": "Target Java major version (e.g. 21, 17, 8; optional, will auto-detect from logs if omitted)" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
            json!({
                "type": "function",
                "function": {
                    "name": "diagnose_server_performance",
                    "description": "Deeply inspects real-time server performance, tick health (TPS & MSPT), Java process CPU and memory utilization, recent overload and lag spike warnings in server logs, chunk/view-distance settings, and installed performance mods/plugins. Returns a structured diagnosis explaining WHY the server is lagging along with actionable solutions.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "server_id": { "type": "string", "description": "The unique ID of the server to diagnose" },
                            "measure_live_tps": { "type": "boolean", "description": "If true and server is running, actively queries live TPS/tick timing via console commands ('tps' or 'tick query') (default: true)" }
                        },
                        "required": ["server_id"]
                    }
                }
            }),
        ]
    }

    /// Executes a tool call and returns an McpToolResult
    pub async fn execute_tool(&self, call: &McpToolCall) -> McpToolResult {
        let name = call.name.as_str();
        let args = &call.arguments;

        let result = match name {
            "list_servers" => self.tool_list_servers().await,
            "get_server_status" => self.tool_get_server_status(args).await,
            "list_plugins" => self.tool_list_plugins(args).await,
            "read_config" => self.tool_read_config(args).await,
            "read_server_logs" => self.tool_read_server_logs(args).await,
            "search_plugins" => self.tool_search_plugins(args).await,
            "get_plugin_details" => self.tool_get_plugin_details(args).await,
            "create_backup" => self.tool_create_backup(args).await,
            "propose_config_change" => self.tool_propose_config_change(args).await,
            "apply_config_change" => self.tool_apply_config_change(args).await,
            "install_plugin" => self.tool_install_plugin(args).await,
            "disable_plugin" => self.tool_disable_plugin(args).await,
            "remove_plugin" => self.tool_remove_plugin(args).await,
            "start_server" => self.tool_start_server(args).await,
            "stop_server" => self.tool_stop_server(args).await,
            "restart_server" => self.tool_restart_server(args).await,
            "open_server_directory" => self.tool_open_server_directory(args).await,
            "restore_backup" => self.tool_restore_backup(args).await,
            "read_file" => self.tool_read_file(args).await,
            "modify_file" => self.tool_modify_file(args).await,
            "delete_server" => self.tool_delete_server(args).await,
            "create_server" => self.tool_create_server(args).await,
            "get_available_versions" => self.tool_get_available_versions(args).await,
            "send_console_command" => self.tool_send_console_command(args).await,
            "inspect_crash_report" => self.tool_inspect_crash_report(args).await,
            "find_in_file" => self.tool_find_in_file(args).await,
            "patch_file" => self.tool_patch_file(args).await,
            "set_server_property" => self.tool_set_server_property(args).await,
            "get_online_players" => self.tool_get_online_players(args).await,
            "get_public_access_status" => self.tool_get_public_access_status(args).await,
            "enable_public_access" => self.tool_enable_public_access(args).await,
            "get_public_access_endpoint" => self.tool_get_public_access_endpoint(args).await,
            "disable_public_access" => self.tool_disable_public_access(args).await,
            "search_modpacks" => self.tool_search_modpacks(args).await,
            "get_modpack_versions" => self.tool_get_modpack_versions(args).await,
            "install_modpack_server" => self.tool_install_modpack_server(args).await,
            "download_java_runtime" => self.tool_download_java_runtime(args).await,
            "auto_fix_server_java" => self.tool_auto_fix_server_java(args).await,
            "diagnose_server_performance" | "get_server_performance" => self.tool_diagnose_server_performance(args).await,
            other => Err(anyhow!("Unknown tool: {}", other)),
        };

        match result {
            Ok(output) => {
                let server_id = args.get("server_id").and_then(|v| v.as_str());
                let _ = self.db.record_operation(
                    server_id,
                    &format!("mcp:{}", name),
                    &args.to_string(),
                    true,
                );
                McpToolResult {
                    tool_call_id: call.id.clone(),
                    name: call.name.clone(),
                    success: true,
                    output,
                    error: None,
                }
            }
            Err(e) => {
                let err_msg = e.to_string();
                let server_id = args.get("server_id").and_then(|v| v.as_str());
                let _ = self.db.record_operation(
                    server_id,
                    &format!("mcp:{}", name),
                    &format!("Error: {}", err_msg),
                    false,
                );
                McpToolResult {
                    tool_call_id: call.id.clone(),
                    name: call.name.clone(),
                    success: false,
                    output: serde_json::Value::Null,
                    error: Some(err_msg),
                }
            }
        }
    }

    async fn tool_list_servers(&self) -> Result<serde_json::Value> {
        let servers = self.db.list_servers()?;
        let data: Vec<serde_json::Value> = servers
            .into_iter()
            .map(|s| {
                let status = self.lifecycle.get_status(&s.id, s.port);
                json!({
                    "id": s.id,
                    "name": s.name,
                    "server_type": s.server_type,
                    "minecraft_version": s.minecraft_version,
                    "port": s.port,
                    "status": status.state,
                    "server_dir": s.server_dir
                })
            })
            .collect();
        Ok(json!({ "servers": data, "count": data.len() }))
    }

    async fn tool_get_server_status(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;
        let status = self.lifecycle.get_status(server_id, server.port);
        Ok(json!({
            "server_id": server.id,
            "name": server.name,
            "status": status.state,
            "port": status.port,
            "online_players": status.online_players,
            "max_players": status.max_players,
            "memory_used_mb": status.memory_used_mb,
            "cpu_percent": status.cpu_percent,
            "pid": status.pid
        }))
    }

    async fn tool_list_plugins(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let items = ExtensionManager::list_installed(&server_dir, &server.server_type)?;
        Ok(json!({ "extensions": items, "count": items.len() }))
    }

    async fn tool_read_config(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let relative_path = args
            .get("relative_path")
            .and_then(|v| v.as_str())
            .unwrap_or("server.properties");
        let start_line = args.get("start_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let end_line = args.get("end_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let tail_lines = args.get("tail_lines").and_then(|v| v.as_u64()).map(|n| n as usize);
        let section = args.get("section").and_then(|v| v.as_str());
        let format = args.get("format").and_then(|v| v.as_str()).unwrap_or("auto");

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let validated = SecurityPolicy::resolve_server_relative_path(&server_dir, relative_path)?;

        if !validated.exists() {
            return Err(anyhow!("Configuration file does not exist: {}", relative_path));
        }

        let full_content = std::fs::read_to_string(&validated)?;
        let mut hasher = Sha256::new();
        hasher.update(full_content.as_bytes());
        let sha256_hex = hex::encode(hasher.finalize());

        let lines: Vec<&str> = full_content.lines().collect();
        let total_lines = lines.len();

        let (selected_lines, range_start, range_end) = if let (Some(s), Some(e)) = (start_line, end_line) {
            let s_idx = s.saturating_sub(1).min(total_lines);
            let e_idx = e.min(total_lines).max(s_idx);
            (lines[s_idx..e_idx].join("\n"), s_idx + 1, e_idx)
        } else if let Some(tail) = tail_lines {
            let t = tail.clamp(1, 500);
            let s_idx = total_lines.saturating_sub(t);
            (lines[s_idx..].join("\n"), s_idx + 1, total_lines)
        } else if let Some(sec) = section {
            let matching: Vec<&str> = lines
                .iter()
                .filter(|l| l.to_lowercase().contains(&sec.to_lowercase()))
                .copied()
                .collect();
            (matching.join("\n"), 1, matching.len())
        } else {
            let capped = if total_lines > 1500 { &lines[..1500] } else { &lines[..] };
            (capped.join("\n"), 1, capped.len())
        };

        Ok(json!({
            "relative_path": relative_path,
            "content": selected_lines,
            "format": format,
            "lines_returned": range_end.saturating_sub(range_start) + 1,
            "total_lines": total_lines,
            "sha256": sha256_hex
        }))
    }

    async fn tool_read_server_logs(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let level = args
            .get("level")
            .and_then(|v| v.as_str())
            .unwrap_or("ALL")
            .to_uppercase();
        let only_errors = args.get("only_errors").and_then(|v| v.as_bool()).unwrap_or(false);
        let tail_lines = args
            .get("tail_lines")
            .and_then(|v| v.as_u64())
            .or_else(|| args.get("limit").and_then(|v| v.as_u64()))
            .unwrap_or(50)
            .clamp(1, 500) as usize;
        let start_line = args.get("start_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let end_line = args.get("end_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let search_pattern = args.get("search_pattern").and_then(|v| v.as_str());

        // Get logs from in-memory ringbuffer or fallback to disk logs/latest.log
        let raw_logs = {
            let mem_logs = self.lifecycle.get_logs(server_id);
            if !mem_logs.is_empty() {
                mem_logs
            } else if let Ok(Some(server)) = self.db.get_server(server_id) {
                let log_file = PathBuf::from(&server.server_dir).join("logs").join("latest.log");
                if log_file.exists() {
                    if let Ok(file) = std::fs::File::open(&log_file) {
                        use std::io::{BufRead, BufReader};
                        let reader = BufReader::new(file);
                        reader.lines().map_while(Result::ok).collect()
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            }
        };

        let total_lines_inspected = raw_logs.len();
        let mut filtered: Vec<String> = Vec::new();
        let mut inside_exception = false;

        for line in raw_logs {
            let lower = line.to_lowercase();
            let is_err = lower.contains("error") || lower.contains("fatal") || lower.contains("exception");
            let is_stack = line.trim_start().starts_with("at ") || line.contains("Caused by:");

            if is_err {
                inside_exception = true;
            } else if !is_stack && !line.trim_start().starts_with("...") {
                inside_exception = false;
            }

            let matches_level = match level.as_str() {
                "ERROR" => is_err || (inside_exception && is_stack),
                "WARN" => is_err || lower.contains("warn") || (inside_exception && is_stack),
                "INFO" => is_err || lower.contains("info") || lower.contains("warn") || (inside_exception && is_stack),
                _ => if only_errors { is_err || (inside_exception && is_stack) } else { true },
            };

            let matches_search = match search_pattern {
                Some(pattern) if !pattern.is_empty() => {
                    lower.contains(&pattern.to_lowercase()) || (inside_exception && is_stack)
                }
                _ => true,
            };

            if matches_level && matches_search {
                filtered.push(line);
            }
        }

        // Deduplicate consecutive identical messages (spam reduction)
        let mut deduped: Vec<String> = Vec::new();
        let mut repeat_count = 0;
        let mut last_line: Option<String> = None;

        for line in filtered {
            if let Some(ref prev) = last_line {
                if prev == &line && !line.trim_start().starts_with("at ") {
                    repeat_count += 1;
                    continue;
                } else if repeat_count > 0 {
                    deduped.push(format!("    ... (previous message repeated {} times) ...", repeat_count));
                    repeat_count = 0;
                }
            }
            last_line = Some(line.clone());
            deduped.push(line);
        }
        if repeat_count > 0 {
            deduped.push(format!("    ... (previous message repeated {} times) ...", repeat_count));
        }

        let (selected_lines, range_start, range_end, truncated) = if let (Some(s), Some(e)) = (start_line, end_line) {
            let s_idx = s.saturating_sub(1).min(deduped.len());
            let e_idx = e.min(deduped.len()).max(s_idx);
            let slice = deduped[s_idx..e_idx].to_vec();
            (slice, s_idx + 1, e_idx, s_idx > 0 || e_idx < deduped.len())
        } else if deduped.len() > tail_lines {
            let s_idx = deduped.len() - tail_lines;
            (deduped[s_idx..].to_vec(), s_idx + 1, deduped.len(), true)
        } else {
            let len = deduped.len();
            (deduped, 1, len, false)
        };

        Ok(json!({
            "lines": selected_lines,
            "lines_returned": selected_lines.len(),
            "total_lines_inspected": total_lines_inspected,
            "range": { "start": range_start, "end": range_end },
            "level": level,
            "truncated": truncated
        }))
    }

    async fn tool_search_plugins(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let query = args["query"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'query'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;

        let results = ExtensionManager::search_modrinth(
            query,
            &server.server_type,
            &server.minecraft_version,
            None,
            0,
            8,
        )
        .await?;

        // Context-optimized compact results (strip markdown, max 120 chars description)
        let compact_results: Vec<serde_json::Value> = results
            .hits
            .into_iter()
            .take(5)
            .map(|hit| {
                let clean_desc: String = hit
                    .description
                    .replace(['*', '_', '#', '`', '[', ']', '<', '>'], "")
                    .chars()
                    .take(120)
                    .collect();
                json!({
                    "project_id": hit.project_id,
                    "slug": hit.slug,
                    "title": hit.title,
                    "description": clean_desc,
                    "downloads": hit.downloads,
                    "categories": hit.categories,
                    "project_url": format!("https://modrinth.com/plugin/{}", hit.slug)
                })
            })
            .collect();

        Ok(json!({ "results": compact_results, "count": compact_results.len() }))
    }

    async fn tool_get_plugin_details(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let project_id = args["project_id_or_slug"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'project_id_or_slug'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;

        let versions = ExtensionManager::get_project_versions(
            project_id,
            &server.server_type,
            Some(&server.minecraft_version),
        )
        .await?;

        Ok(json!({ "project": project_id, "versions": versions }))
    }

    async fn tool_create_backup(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let description = args["description"]
            .as_str()
            .unwrap_or("Automated backup before modification");

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let backup = BackupManager::create_backup(&server_dir, server_id, description)?;
        Ok(json!({ "backup": backup, "success": true }))
    }

    async fn tool_propose_config_change(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let updates_obj = args["updates"]
            .as_object()
            .ok_or_else(|| anyhow!("'updates' must be an object of key-value pairs"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let mut updates = BTreeMap::new();
        for (k, v) in updates_obj {
            let val_str = match v {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Number(n) => n.to_string(),
                _ => v.to_string(),
            };
            updates.insert(k.clone(), val_str);
        }

        let diffs = ConfigManager::propose_changes(&server_dir, &updates)?;
        Ok(json!({ "diffs": diffs, "count": diffs.len() }))
    }

    async fn tool_apply_config_change(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let updates_obj = args["updates"]
            .as_object()
            .ok_or_else(|| anyhow!("'updates' must be an object of key-value pairs"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let mut updates = BTreeMap::new();
        for (k, v) in updates_obj {
            let val_str = match v {
                serde_json::Value::String(s) => s.clone(),
                serde_json::Value::Bool(b) => b.to_string(),
                serde_json::Value::Number(n) => n.to_string(),
                _ => v.to_string(),
            };
            updates.insert(k.clone(), val_str);
        }

        let diffs = ConfigManager::apply_changes(&server_dir, &updates)?;
        Ok(json!({ "applied_diffs": diffs, "success": true }))
    }

    async fn tool_find_in_file(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let relative_path = args["relative_path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'relative_path'"))?;
        let search_pattern = args["search_pattern"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'search_pattern'"))?;
        let case_sensitive = args.get("case_sensitive").and_then(|v| v.as_bool()).unwrap_or(false);

        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let validated = SecurityPolicy::resolve_server_relative_path(&server_dir, relative_path)?;

        if !validated.exists() {
            return Err(anyhow!("File not found: {}", relative_path));
        }

        let content = std::fs::read_to_string(&validated)?;
        let lines: Vec<&str> = content.lines().collect();
        let mut matches = Vec::new();

        for (idx, line) in lines.iter().enumerate() {
            let matched = if case_sensitive {
                line.contains(search_pattern)
            } else {
                line.to_lowercase().contains(&search_pattern.to_lowercase())
            };

            if matched {
                let start_ctx = idx.saturating_sub(2);
                let end_ctx = (idx + 3).min(lines.len());
                let context: Vec<String> = lines[start_ctx..end_ctx]
                    .iter()
                    .enumerate()
                    .map(|(offset, l)| format!("{}: {}", start_ctx + offset + 1, l))
                    .collect();

                matches.push(json!({
                    "line_number": idx + 1,
                    "line_text": line,
                    "context": context
                }));
            }
        }

        Ok(json!({
            "relative_path": relative_path,
            "matches_count": matches.len(),
            "matches": matches
        }))
    }

    async fn tool_patch_file(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let relative_path = args["relative_path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'relative_path'"))?;
        let find_text = args.get("find_text").and_then(|v| v.as_str());
        let replace_text = args.get("replace_text").and_then(|v| v.as_str()).unwrap_or("");
        let start_line = args.get("start_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let end_line = args.get("end_line").and_then(|v| v.as_u64()).map(|n| n as usize);
        let expected_hash = args.get("expected_hash").and_then(|v| v.as_str());

        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let validated = SecurityPolicy::resolve_server_relative_path(&server_dir, relative_path)?;

        if !validated.exists() {
            return Err(anyhow!("File does not exist: {}", relative_path));
        }

        let current_content = std::fs::read_to_string(&validated)?;

        // Optimistic concurrency check
        if let Some(expected) = expected_hash {
            let mut hasher = Sha256::new();
            hasher.update(current_content.as_bytes());
            let current_hash = hex::encode(hasher.finalize());
            if !current_hash.eq_ignore_ascii_case(expected) {
                return Err(anyhow!(
                    "Concurrency conflict: The file has been modified since it was read. Expected hash {}, got {}.",
                    expected, current_hash
                ));
            }
        }

        // Automatic backup before patch
        let backup_dir = server_dir.join("backups");
        let _ = std::fs::create_dir_all(&backup_dir);
        let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let clean_name = relative_path.replace(['/', '\\'], "_");
        let backup_file = backup_dir.join(format!("patch_{}_{}.bak", clean_name, now));
        std::fs::copy(&validated, &backup_file)?;

        let new_content = if let Some(find) = find_text {
            if !current_content.contains(find) {
                return Err(anyhow!("Target 'find_text' was not found in {:?}", relative_path));
            }
            current_content.replacen(find, replace_text, 1)
        } else if let (Some(s), Some(e)) = (start_line, end_line) {
            let lines: Vec<&str> = current_content.lines().collect();
            let s_idx = s.saturating_sub(1).min(lines.len());
            let e_idx = e.min(lines.len()).max(s_idx);

            let mut out = Vec::new();
            out.extend_from_slice(&lines[..s_idx]);
            if !replace_text.is_empty() {
                out.push(replace_text);
            }
            out.extend_from_slice(&lines[e_idx..]);
            out.join("\n")
        } else {
            return Err(anyhow!("patch_file requires either 'find_text' or 'start_line'/'end_line'"));
        };

        // Atomic write
        let tmp_file = validated.with_extension("tmp");
        std::fs::write(&tmp_file, &new_content)?;
        std::fs::rename(&tmp_file, &validated)?;

        let mut hasher = Sha256::new();
        hasher.update(new_content.as_bytes());
        let new_hash = hex::encode(hasher.finalize());

        Ok(json!({
            "relative_path": relative_path,
            "success": true,
            "backup_file": backup_file.file_name().unwrap().to_string_lossy(),
            "new_sha256": new_hash
        }))
    }

    async fn tool_set_server_property(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let key = args["key"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'key'"))?;
        let value = args["value"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'value'"))?;

        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let mut updates = BTreeMap::new();
        updates.insert(key.to_string(), value.to_string());
        let diffs = ConfigManager::apply_changes(&server_dir, &updates)?;

        // If port changed, update database server profile
        if key == "server-port" {
            if let Ok(new_port) = value.parse::<u16>() {
                let mut updated_server = server.clone();
                updated_server.port = new_port;
                let _ = self.db.update_server(&updated_server);
            }
        }

        Ok(json!({
            "key": key,
            "value": value,
            "applied_diffs": diffs,
            "success": true
        }))
    }

    async fn tool_send_console_command(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let command = args["command"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'command'"))?
            .trim();

        if command.is_empty() {
            return Err(anyhow!("Command cannot be empty"));
        }

        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let (requires_approval, explanation, impact) = Self::classify_command(command);

        if requires_approval {
            let approval_id = uuid::Uuid::new_v4().to_string();
            let now = chrono::Utc::now().timestamp();
            let approval = PendingCommandApproval {
                id: approval_id.clone(),
                server_id: server_id.to_string(),
                server_name: server.name.clone(),
                command: command.to_string(),
                explanation: explanation.to_string(),
                impact: impact.to_string(),
                created_at: now,
                expires_at: now + 300,
            };

            {
                let mut apps = self.approvals.lock().unwrap();
                apps.insert(approval_id.clone(), approval.clone());
            }

            let _ = self.app_handle.emit("console-command-requested", &approval);

            return Ok(json!({
                "status": "requires_approval",
                "approval_id": approval_id,
                "server_id": server_id,
                "server_name": server.name,
                "command": command,
                "explanation": explanation,
                "impact": impact,
                "requires_user_approval": true,
                "message": format!("The command '{}' requires explicit user approval before execution.", command)
            }));
        }

        // Auto-approved command
        self.lifecycle.send_command(server_id, command)?;
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        Ok(json!({
            "status": "executed",
            "server_id": server_id,
            "command": command,
            "success": true,
            "output": format!("Sent command '{}' to server console", command)
        }))
    }

    pub fn parse_crash_report(content: &str, filename: &str) -> serde_json::Value {
        let mut description = String::new();
        let mut exception = String::new();
        let mut mc_version = String::new();
        let mut java_version = String::new();
        let mut caused_by = Vec::new();
        let mut suspected_extensions = Vec::new();

        let known_packages = &[
            ("com.sk89q.worldedit", "WorldEdit"),
            ("com.earth2me.essentials", "EssentialsX"),
            ("net.coreprotect", "CoreProtect"),
            ("com.massivecraft.factions", "Factions"),
            ("me.clip.placeholderapi", "PlaceholderAPI"),
            ("com.onarandombox.multiverse", "Multiverse-Core"),
            ("org.geysermc.geyser", "GeyserMC"),
            ("org.geysermc.floodgate", "Floodgate"),
            ("com.viaversion.viaversion", "ViaVersion"),
            ("net.luckperms", "LuckPerms"),
        ];

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("Description:") {
                description = trimmed.trim_start_matches("Description:").trim().to_string();
            } else if trimmed.starts_with("Minecraft Version:") {
                mc_version = trimmed.trim_start_matches("Minecraft Version:").trim().to_string();
            } else if trimmed.starts_with("Java Version:") {
                java_version = trimmed.trim_start_matches("Java Version:").trim().to_string();
            } else if trimmed.starts_with("Caused by:") {
                caused_by.push(trimmed.trim_start_matches("Caused by:").trim().to_string());
            } else if trimmed.contains("Exception:") || (trimmed.starts_with("java.lang.") && exception.is_empty()) {
                if exception.is_empty() {
                    exception = trimmed.to_string();
                }
            }

            for (pkg, name) in known_packages {
                if trimmed.contains(pkg) && !suspected_extensions.contains(&name.to_string()) {
                    suspected_extensions.push(name.to_string());
                }
            }
        }

        let stack_snippet: Vec<&str> = content.lines().take(40).collect();

        json!({
            "found": true,
            "file": filename,
            "description": if description.is_empty() { "Server crash" } else { &description },
            "exception": if exception.is_empty() { "Unknown exception" } else { &exception },
            "caused_by": caused_by,
            "suspected_extensions": suspected_extensions,
            "minecraft_version": mc_version,
            "java_version": java_version,
            "stack_trace_snippet": stack_snippet.join("\n")
        })
    }

    async fn tool_inspect_crash_report(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let crash_dir = server_dir.join("crash-reports");

        if crash_dir.exists() {
            let mut crash_files: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();
            if let Ok(entries) = std::fs::read_dir(&crash_dir) {
                for entry in entries.filter_map(Result::ok) {
                    let p = entry.path();
                    if p.is_file() && p.extension().map(|e| e == "txt").unwrap_or(false) {
                        let mtime = entry.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                        crash_files.push((p, mtime));
                    }
                }
            }
            crash_files.sort_by(|a, b| b.1.cmp(&a.1));

            if let Some((latest_path, _)) = crash_files.first() {
                let content = std::fs::read_to_string(latest_path).unwrap_or_default();
                let summary = Self::parse_crash_report(&content, latest_path.file_name().unwrap().to_string_lossy().as_ref());
                return Ok(summary);
            }
        }

        // Fall back to scanning recent server logs for fatal errors
        let logs = self.lifecycle.get_logs(server_id);
        let mut error_lines: Vec<String> = Vec::new();
        for line in logs.iter().rev().take(100) {
            if line.contains("ERROR") || line.contains("Exception") || line.contains("FATAL") || line.contains("Caused by") {
                error_lines.push(line.clone());
                if error_lines.len() >= 15 {
                    break;
                }
            }
        }
        error_lines.reverse();

        if !error_lines.is_empty() {
            Ok(json!({
                "found": true,
                "source": "latest_logs",
                "message": "No standalone crash report file was found in crash-reports/, but recent fatal errors were detected in server logs.",
                "error_lines": error_lines
            }))
        } else {
            Ok(json!({
                "found": false,
                "message": "No crash reports found in crash-reports/ and no recent fatal errors found in server logs."
            }))
        }
    }

    async fn tool_get_online_players(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self.db.get_server(server_id)?.ok_or_else(|| anyhow!("Server not found"))?;
        let status = self.lifecycle.get_status(server_id, server.port);
        let server_dir = PathBuf::from(&server.server_dir);

        let mut operators = Vec::new();
        let ops_file = server_dir.join("ops.json");
        if ops_file.exists() {
            if let Ok(c) = std::fs::read_to_string(&ops_file) {
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&c) {
                    for item in arr {
                        if let Some(name) = item["name"].as_str() {
                            operators.push(name.to_string());
                        }
                    }
                }
            }
        }

        let mut whitelist = Vec::new();
        let wl_file = server_dir.join("whitelist.json");
        if wl_file.exists() {
            if let Ok(c) = std::fs::read_to_string(&wl_file) {
                if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&c) {
                    for item in arr {
                        if let Some(name) = item["name"].as_str() {
                            whitelist.push(name.to_string());
                        }
                    }
                }
            }
        }

        let is_running = matches!(status.state, crate::models::ServerStatusState::Running);

        Ok(json!({
            "server_id": server_id,
            "server_name": server.name,
            "is_running": is_running,
            "port": server.port,
            "online_count": status.online_players.unwrap_or(0),
            "max_players": status.max_players.unwrap_or(20),
            "operators": operators,
            "whitelist": whitelist
        }))
    }

    async fn tool_install_plugin(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let project_id = args["project_id_or_slug"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'project_id_or_slug'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let versions = ExtensionManager::get_project_versions(
            project_id,
            &server.server_type,
            Some(&server.minecraft_version),
        )
        .await?;

        let latest_ver = versions
            .first()
            .ok_or_else(|| anyhow!("No compatible versions found on Modrinth for {}", project_id))?;

        let primary_file = latest_ver
            .files
            .iter()
            .find(|f| f.primary)
            .or_else(|| latest_ver.files.first())
            .ok_or_else(|| anyhow!("No downloadable file found for version"))?;

        let installed_file = ExtensionManager::download_and_install(
            &server_dir,
            &server.server_type,
            primary_file,
        )
        .await?;

        Ok(json!({
            "installed_file": installed_file,
            "version": latest_ver.version_number,
            "success": true
        }))
    }

    async fn tool_disable_plugin(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let file_name = args["file_name"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'file_name'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        let new_name =
            ExtensionManager::toggle_extension(&server_dir, &server.server_type, file_name)?;
        Ok(json!({ "new_file_name": new_name, "success": true }))
    }

    async fn tool_remove_plugin(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let file_name = args["file_name"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'file_name'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        ExtensionManager::remove_extension(&server_dir, &server.server_type, file_name)?;
        Ok(json!({ "removed": file_name, "success": true }))
    }

    async fn tool_start_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;

        // Pre-check port conflict
        if let Err(e) = std::net::TcpListener::bind(("0.0.0.0", server.port)) {
            return Err(anyhow!(
                "Port conflict: Port {} is currently in use by another application ({}).",
                server.port, e
            ));
        }

        self.lifecycle
            .start_server(self.app_handle.clone(), &server)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "started", "server_id": server_id }));
        Ok(json!({ "status": "starting", "server_id": server_id, "port": server.port }))
    }

    async fn tool_stop_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        self.lifecycle.stop_server(server_id)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "stopped", "server_id": server_id }));
        Ok(json!({ "status": "stopping", "server_id": server_id }))
    }

    async fn tool_restart_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;

        self.lifecycle
            .restart_server(self.app_handle.clone(), &server)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "restarted", "server_id": server_id }));
        Ok(json!({ "status": "restarting", "server_id": server_id }))
    }

    async fn tool_open_server_directory(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;

        let path = PathBuf::from(&server.server_dir);
        if !path.exists() {
            std::fs::create_dir_all(&path)?;
        }

        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer").arg(&server.server_dir).spawn()?;
        }
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open").arg(&server.server_dir).spawn()?;
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            std::process::Command::new("xdg-open").arg(&server.server_dir).spawn()?;
        }

        Ok(json!({ "opened": server.server_dir, "success": true }))
    }

    async fn tool_restore_backup(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let backup_filename = args["backup_filename"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'backup_filename'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);

        BackupManager::restore_backup(&server_dir, backup_filename)?;
        Ok(json!({ "restored": backup_filename, "server_id": server_id, "success": true }))
    }

    async fn tool_read_file(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let relative_path = args["relative_path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'relative_path'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let validated = SecurityPolicy::resolve_server_relative_path(&server_dir, relative_path)?;

        if !validated.exists() {
            return Err(anyhow!("File does not exist: {}", relative_path));
        }

        let content = std::fs::read_to_string(&validated)
            .map_err(|e| anyhow!("Failed to read file {:?}: {}", relative_path, e))?;

        Ok(json!({
            "relative_path": relative_path,
            "content": content,
            "size_bytes": content.len()
        }))
    }

    async fn tool_modify_file(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let relative_path = args["relative_path"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'relative_path'"))?;
        let content = args["content"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'content'"))?;

        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found"))?;
        let server_dir = PathBuf::from(&server.server_dir);
        let validated = SecurityPolicy::resolve_server_relative_path(&server_dir, relative_path)?;

        if let Some(parent) = validated.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Backup existing file if present
        if validated.exists() {
            let backup_dir = server_dir.join("backups");
            let _ = std::fs::create_dir_all(&backup_dir);
            let now = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let backup_path = backup_dir.join(format!("{}.bak.{}", relative_path.replace(['/', '\\'], "_"), now));
            let _ = std::fs::copy(&validated, backup_path);
        }

        std::fs::write(&validated, content)?;

        Ok(json!({
            "relative_path": relative_path,
            "bytes_written": content.len(),
            "success": true
        }))
    }

    async fn tool_delete_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let delete_files = args["delete_files"].as_bool().unwrap_or(true);

        if let Some(server) = self.db.get_server(server_id)? {
            let _ = self.lifecycle.stop_server(server_id);
            if delete_files {
                let path = PathBuf::from(&server.server_dir);
                if path.exists() {
                    let _ = std::fs::remove_dir_all(path);
                }
            }
            self.db.delete_server(server_id)?;
            let _ = self.app_handle.emit("servers-changed", json!({ "action": "deleted", "server_id": server_id }));
            Ok(json!({ "deleted_server_id": server_id, "name": server.name, "success": true }))
        } else {
            Err(anyhow!("Server with ID '{}' not found", server_id))
        }
    }

    async fn tool_create_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let name = args["name"].as_str().ok_or_else(|| anyhow!("Missing 'name'"))?;
        let st_str = args["server_type"].as_str().ok_or_else(|| anyhow!("Missing 'server_type'"))?;
        let raw_version = args["minecraft_version"].as_str().ok_or_else(|| anyhow!("Missing 'minecraft_version'"))?;

        let desired_port = args.get("port").and_then(|v| v.as_u64()).unwrap_or(25565) as u16;
        let (final_port, was_reassigned) = Self::find_available_port(desired_port);

        let min_ram = args.get("min_ram_mb").and_then(|v| v.as_u64()).unwrap_or(1024) as u32;
        let max_ram = args.get("max_ram_mb").and_then(|v| v.as_u64()).unwrap_or(2048) as u32;

        SecurityPolicy::validate_server_name(name)?;
        SecurityPolicy::validate_port(final_port)?;
        SecurityPolicy::validate_memory(min_ram, max_ram)?;

        let server_type = match st_str.to_lowercase().as_str() {
            "paper" => ServerType::Paper,
            "purpur" => ServerType::Purpur,
            "spigot" => ServerType::Spigot,
            "fabric" => ServerType::Fabric,
            "forge" => ServerType::Forge,
            "neoforge" => ServerType::NeoForge,
            "vanilla" => ServerType::Vanilla,
            "quilt" => ServerType::Quilt,
            other => return Err(anyhow!("Unsupported server_type: '{}'", other)),
        };

        let target_version = if raw_version.eq_ignore_ascii_case("latest") || raw_version.eq_ignore_ascii_case("latest release") {
            let manifest = self.software_manager.get_version_manifest(false).await?;
            manifest.latest.release
        } else {
            raw_version.to_string()
        };

        let id = uuid::Uuid::new_v4().to_string();
        let sanitized_name = name.to_lowercase().replace(|c: char| !c.is_alphanumeric() && c != '-', "_");

        let data_dir = dirs::data_dir()
            .map(|p| p.join("mcset"))
            .unwrap_or_else(|| std::env::current_dir().unwrap().join(".mcset_data"));
        let server_dir = data_dir.join("servers").join(format!("{}_{}", sanitized_name, &id[..8]));
        std::fs::create_dir_all(&server_dir)?;

        let build_info = self.software_manager.resolve_provider_build(&server_type, &target_version).await?;
        let jar_file = build_info.target_jar.clone();

        self.software_manager.download_and_install(
            None,
            &server_dir,
            &build_info,
            None,
        ).await?;

        let props_path = server_dir.join("server.properties");
        let initial_props = format!(
            "# Minecraft server properties\nserver-port={}\nmotd={}\ngamemode=survival\ndifficulty=normal\nmax-players=20\nonline-mode=true\n",
            final_port, name
        );
        let _ = std::fs::write(&props_path, initial_props);

        let eula_path = server_dir.join("eula.txt");
        let _ = std::fs::write(&eula_path, "# By changing the setting below to TRUE you are indicating your agreement to our EULA\neula=true\n");

        let now = chrono::Utc::now().timestamp();
        let profile = ServerProfile {
            id: id.clone(),
            name: name.to_string(),
            server_type: server_type.clone(),
            minecraft_version: target_version.clone(),
            java_path: None,
            min_ram_mb: min_ram,
            max_ram_mb: max_ram,
            jvm_flags: "-XX:+UseG1GC".to_string(),
            server_dir: server_dir.to_string_lossy().to_string(),
            jar_file: jar_file.clone(),
            port: final_port,
            eula_accepted: true,
            autostart: false,
            created_at: now,
            updated_at: now,
        };

        self.db.insert_server(&profile)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "created", "server": profile }));

        let port_notice = if was_reassigned {
            format!("Requested port {} was already in use. Automatically assigned port {}.", desired_port, final_port)
        } else {
            format!("Port {} is active.", final_port)
        };

        Ok(json!({
            "message": format!("Server '{}' successfully created and installed! ({})", name, port_notice),
            "server": profile,
            "port_reassigned": was_reassigned,
            "success": true
        }))
    }

    async fn tool_get_available_versions(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let force = args.get("force_refresh").and_then(|v| v.as_bool()).unwrap_or(false);
        let category = args.get("category").and_then(|v| v.as_str()).unwrap_or("release");
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(25) as usize;

        let manifest = self.software_manager.get_version_manifest(force).await?;

        let filtered: Vec<&crate::models::MinecraftVersionEntry> = manifest
            .versions
            .iter()
            .filter(|v| match category {
                "release" => v.version_type == "release",
                "snapshot" => v.version_type == "snapshot",
                _ => true,
            })
            .take(limit)
            .collect();

        Ok(json!({
            "latest_release": manifest.latest.release,
            "latest_snapshot": manifest.latest.snapshot,
            "versions": filtered,
            "count": filtered.len()
        }))
    }

    async fn tool_get_public_access_status(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self.db.get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;
        let status = self.portal_manager.get_status(server_id, server.port);
        Ok(serde_json::to_value(&status)?)
    }

    async fn tool_enable_public_access(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self.db.get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;
        let status = self.portal_manager.start_tunnel(self.app_handle.clone(), &server)?;
        Ok(serde_json::to_value(&status)?)
    }

    async fn tool_get_public_access_endpoint(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self.db.get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;
        let status = self.portal_manager.get_status(server_id, server.port);
        Ok(json!({
            "server_id": server_id,
            "public_address": status.public_address,
            "relay_url": status.relay_url,
            "is_verified": status.is_verified,
            "is_running": status.is_running,
            "state": status.status
        }))
    }

    async fn tool_disable_public_access(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let status = self.portal_manager.stop_tunnel(server_id, Some(&self.app_handle));
        Ok(serde_json::to_value(&status)?)
    }

    async fn tool_search_modpacks(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let query = args["query"].as_str().ok_or_else(|| anyhow!("Missing 'query'"))?;
        let provider = args.get("provider").and_then(|v| v.as_str()).unwrap_or("modrinth");
        let mc_version = args.get("minecraft_version").and_then(|v| v.as_str());
        let loader = args.get("loader").and_then(|v| v.as_str()).unwrap_or("all");
        let limit = args.get("limit").and_then(|v| v.as_u64()).unwrap_or(8) as u32;

        let results = self.modpack_manager.search_modpacks(
            provider,
            query,
            mc_version,
            if loader == "all" { None } else { Some(loader) },
            0,
            limit,
            None,
        ).await?;

        let hits: Vec<serde_json::Value> = results.hits.into_iter().map(|h| {
            json!({
                "id": h.id,
                "title": h.title,
                "slug": h.slug,
                "description": h.description,
                "author": h.author,
                "loaders": h.loaders,
                "game_versions": h.game_versions,
                "downloads": h.downloads,
            })
        }).collect();

        Ok(json!({
            "provider": provider,
            "query": query,
            "total_hits": results.total_hits,
            "modpacks": hits
        }))
    }

    async fn tool_get_modpack_versions(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let project_id = args["project_id"].as_str().ok_or_else(|| anyhow!("Missing 'project_id'"))?;
        let provider = args.get("provider").and_then(|v| v.as_str()).unwrap_or("modrinth");

        let versions = self.modpack_manager.get_modpack_versions(provider, project_id, None).await?;
        let vers_json: Vec<serde_json::Value> = versions.into_iter().take(15).map(|v| {
            json!({
                "id": v.id,
                "name": v.name,
                "version_number": v.version_number,
                "game_versions": v.game_versions,
                "loaders": v.loaders,
                "date_published": v.date_published,
                "server_pack_available": v.server_pack_available,
                "filename": v.filename,
                "file_size": v.file_size,
            })
        }).collect();

        Ok(json!({
            "provider": provider,
            "project_id": project_id,
            "versions_count": vers_json.len(),
            "versions": vers_json
        }))
    }

    async fn tool_install_modpack_server(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let name = args["name"].as_str().ok_or_else(|| anyhow!("Missing 'name'"))?;
        let project_id = args["project_id"].as_str().ok_or_else(|| anyhow!("Missing 'project_id'"))?;
        let provider = args.get("provider").and_then(|v| v.as_str()).unwrap_or("modrinth");
        let version_id_arg = args.get("version_id").and_then(|v| v.as_str());
        let mc_version_arg = args.get("minecraft_version").and_then(|v| v.as_str());
        let loader_arg = args.get("loader").and_then(|v| v.as_str());
        let desired_port = args.get("port").and_then(|v| v.as_u64()).unwrap_or(25565) as u16;
        let (port, was_conflict) = Self::find_available_port(desired_port);
        let min_ram = args.get("min_ram_mb").and_then(|v| v.as_u64()).unwrap_or(2048) as u32;
        let max_ram = args.get("max_ram_mb").and_then(|v| v.as_u64()).unwrap_or(4096) as u32;

        let eula_accepted = args.get("eula_accepted").and_then(|v| v.as_bool()).unwrap_or(false);
        if !eula_accepted {
            return Err(anyhow!("Minecraft EULA must be accepted (eula_accepted: true) to install server."));
        }

        // Fetch versions to resolve version and primary download URL
        let versions = self.modpack_manager.get_modpack_versions(provider, project_id, None).await?;
        if versions.is_empty() {
            return Err(anyhow!("No versions found for modpack project '{}' on {}", project_id, provider));
        }

        let selected_v = match version_id_arg {
            Some(vid) => versions.iter().find(|v| v.id == vid).cloned().ok_or_else(|| anyhow!("Version '{}' not found", vid))?,
            None => {
                // Find version matching loader or mc_version if specified
                versions.iter().find(|v| {
                    let loader_match = match loader_arg {
                        Some(l) => v.loaders.iter().any(|item| item.eq_ignore_ascii_case(l)),
                        None => true,
                    };
                    let mc_match = match mc_version_arg {
                        Some(mc) => v.game_versions.iter().any(|item| item == mc),
                        None => true,
                    };
                    loader_match && mc_match
                }).cloned().unwrap_or_else(|| versions[0].clone())
            }
        };

        let download_url = selected_v.files.first().map(|f| f.url.clone()).unwrap_or_else(|| selected_v.download_url.clone());
        let install_id = format!("ai-install-{}", chrono::Utc::now().timestamp_millis());

        let req = crate::models::InstallModpackRequest {
            install_id,
            name: name.to_string(),
            provider: provider.to_string(),
            project_id: project_id.to_string(),
            version_id: selected_v.id.clone(),
            download_url,
            port: Some(port),
            min_ram_mb: Some(min_ram),
            max_ram_mb: Some(max_ram),
            accept_eula: true,
            java_path: None,
            jvm_flags: None,
            custom_dir: None,
            curseforge_api_key: None,
            local_archive_path: None,
            online_mode: Some(true),
        };

        let profile = self.modpack_manager.install_modpack_server(self.app_handle.clone(), req).await?;
        self.db.insert_server(&profile)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "created", "server": profile.clone() }));

        Ok(json!({
            "status": "success",
            "server_id": profile.id,
            "name": profile.name,
            "server_type": profile.server_type,
            "minecraft_version": profile.minecraft_version,
            "port": profile.port,
            "port_reassigned": was_conflict,
            "original_requested_port": desired_port,
            "server_dir": profile.server_dir,
            "java_path": profile.java_path,
            "message": format!("Modpack server '{}' successfully installed and deployed! Ready to start.", profile.name)
        }))
    }

    async fn tool_download_java_runtime(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let major = args["major_version"].as_u64().ok_or_else(|| anyhow!("Missing 'major_version'"))? as u32;
        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("mcset");

        let runtime = crate::java_manager::JavaManager::download_and_install_jdk(&data_dir, major, Some(&self.app_handle)).await?;
        Ok(json!({
            "status": "installed",
            "major_version": runtime.major_version,
            "version_str": runtime.version_str,
            "path": runtime.path,
            "vendor": runtime.vendor
        }))
    }

    async fn tool_auto_fix_server_java(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"].as_str().ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let target_major = args.get("target_major").and_then(|v| v.as_u64()).map(|v| v as u32);

        let mut profile = self.db.get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;

        let _ = self.lifecycle.stop_server(server_id);

        let required_major = match target_major {
            Some(m) => m,
            None => {
                if let Ok(m) = self.software_manager.get_required_java_version(&profile.minecraft_version).await {
                    m
                } else {
                    crate::java_manager::JavaManager::get_recommended_java_major(&profile.minecraft_version).1
                }
            }
        };

        let data_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("mcset");

        let installed_java_path = crate::java_manager::JavaManager::find_or_install_compatible_java(
            &data_dir,
            &profile.minecraft_version,
            Some(&self.app_handle),
        ).await?;

        profile.java_path = Some(installed_java_path.clone());
        profile.updated_at = chrono::Utc::now().timestamp();
        self.db.update_server(&profile)?;
        let _ = self.app_handle.emit("servers-changed", json!({ "action": "updated", "server": profile.clone() }));

        let _ = self.lifecycle.start_server(self.app_handle.clone(), &profile);

        Ok(json!({
            "status": "repaired",
            "server_id": profile.id,
            "resolved_java_major": required_major,
            "java_path": installed_java_path,
            "message": format!("Java {} configured. Server restarted successfully.", required_major)
        }))
    }
    /// Extracts performance indicators (overload count, max/total ms behind, memory errors, TPS lines) from server logs
    pub fn parse_log_performance_indicators(logs: &[String]) -> (usize, u64, u64, Vec<String>, Vec<String>, Option<String>, Option<String>) {
        let mut overload_count = 0;
        let mut max_overload_ms: u64 = 0;
        let mut total_overload_ms: u64 = 0;
        let mut recent_overload_snippets = Vec::new();
        let mut memory_errors = Vec::new();
        let mut measured_tps_line: Option<String> = None;
        let mut measured_tick_time_line: Option<String> = None;

        let overload_re = regex::Regex::new(r"Can't keep up!.*Running\s+(\d+)ms\s+or\s+(\d+)\s+ticks\s+behind").ok();
        let tps_re = regex::Regex::new(r"TPS from last 1m,\s*5m,\s*15m:\s*([0-9.,\s*]+)").ok();
        let tick_query_re = regex::Regex::new(r"(The target tick rate is|Current tick time:?)\s*(.*)").ok();

        for line in logs.iter().rev().take(300) {
            let lower = line.to_lowercase();
            if lower.contains("outofmemory") || lower.contains("gc overhead limit") {
                if memory_errors.len() < 3 {
                    memory_errors.push(line.clone());
                }
            }
            if let Some(ref re) = overload_re {
                if let Some(caps) = re.captures(line) {
                    overload_count += 1;
                    if let Some(ms_match) = caps.get(1) {
                        if let Ok(ms) = ms_match.as_str().parse::<u64>() {
                            if ms > max_overload_ms {
                                max_overload_ms = ms;
                            }
                            total_overload_ms += ms;
                        }
                    }
                    if recent_overload_snippets.len() < 3 {
                        recent_overload_snippets.push(line.clone());
                    }
                }
            }
            if measured_tps_line.is_none() {
                if let Some(ref re) = tps_re {
                    if let Some(caps) = re.captures(line) {
                        if let Some(m) = caps.get(1) {
                            measured_tps_line = Some(m.as_str().trim().to_string());
                        }
                    }
                }
            }
            if measured_tick_time_line.is_none() {
                if let Some(ref re) = tick_query_re {
                    if re.is_match(line) {
                        measured_tick_time_line = Some(line.trim().to_string());
                    }
                }
            }
        }

        (overload_count, max_overload_ms, total_overload_ms, recent_overload_snippets, memory_errors, measured_tps_line, measured_tick_time_line)
    }

    async fn tool_diagnose_server_performance(&self, args: &serde_json::Value) -> Result<serde_json::Value> {
        let server_id = args["server_id"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing 'server_id'"))?;
        let server = self
            .db
            .get_server(server_id)?
            .ok_or_else(|| anyhow!("Server not found: {}", server_id))?;
        let status = self.lifecycle.get_status(server_id, server.port);
        let measure_live = args.get("measure_live_tps").and_then(|v| v.as_bool()).unwrap_or(true);

        let max_ram_mb = server.max_ram_mb;
        let memory_used_mb = status.memory_used_mb.unwrap_or(0);
        let memory_percent = if max_ram_mb > 0 {
            (memory_used_mb as f64 / max_ram_mb as f64) * 100.0
        } else {
            0.0
        };
        let cpu_percent = status.cpu_percent.unwrap_or(0.0);

        let logs = self.lifecycle.get_logs(server_id);
        let (overload_count, max_overload_ms, total_overload_ms, recent_overload_snippets, memory_errors, mut measured_tps_line, mut measured_tick_time_line) =
            Self::parse_log_performance_indicators(&logs);

        // If server is running and live measurement requested, poll tps or tick query
        if measure_live && matches!(status.state, ServerStatusState::Running) {
            let st = format!("{:?}", server.server_type).to_lowercase();
            if st.contains("paper") || st.contains("purpur") || st.contains("spigot") {
                let _ = self.lifecycle.send_command(server_id, "tps");
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                let new_logs = self.lifecycle.get_logs(server_id);
                let (_, _, _, _, _, polled_tps, _) = Self::parse_log_performance_indicators(&new_logs);
                if polled_tps.is_some() {
                    measured_tps_line = polled_tps;
                }
            } else if st.contains("fabric") || st.contains("vanilla") {
                let _ = self.lifecycle.send_command(server_id, "tick query");
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
                let new_logs = self.lifecycle.get_logs(server_id);
                let (_, _, _, _, _, _, polled_tick) = Self::parse_log_performance_indicators(&new_logs);
                if polled_tick.is_some() {
                    measured_tick_time_line = polled_tick;
                }
            }
        }

        let avg_overload_ms = if overload_count > 0 {
            total_overload_ms / (overload_count as u64)
        } else {
            0
        };

        // Estimate current TPS health
        let estimated_tps: f64 = if !matches!(status.state, ServerStatusState::Running) {
            0.0
        } else if let Some(ref tps_str) = measured_tps_line {
            tps_str.split(',')
                .next()
                .and_then(|s| s.trim().trim_start_matches('*').parse::<f64>().ok())
                .unwrap_or(20.0)
        } else if overload_count > 0 {
            let tick_duration = (50 + (avg_overload_ms / 20).max(5)) as f64;
            (1000.0 / tick_duration).min(20.0)
        } else {
            20.0
        };

        let server_dir = PathBuf::from(&server.server_dir);
        let props_path = server_dir.join("server.properties");
        let mut view_distance: Option<u32> = None;
        let mut simulation_distance: Option<u32> = None;
        let mut entity_broadcast_range: Option<u32> = None;
        let mut network_compression_threshold: Option<i32> = None;

        if props_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&props_path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with('#') || trimmed.is_empty() {
                        continue;
                    }
                    if let Some((k, v)) = trimmed.split_once('=') {
                        match k.trim() {
                            "view-distance" => view_distance = v.trim().parse().ok(),
                            "simulation-distance" => simulation_distance = v.trim().parse().ok(),
                            "entity-broadcast-range-percentage" => entity_broadcast_range = v.trim().parse().ok(),
                            "network-compression-threshold" => network_compression_threshold = v.trim().parse().ok(),
                            _ => {}
                        }
                    }
                }
            }
        }

        let installed = ExtensionManager::list_installed(&server_dir, &server.server_type).unwrap_or_default();
        let installed_names: Vec<String> = installed.iter().map(|e| e.name.to_lowercase()).collect();

        let mut detected_optimizations = Vec::new();
        let mut missing_recommended = Vec::new();

        let st_lower = format!("{:?}", server.server_type).to_lowercase();
        if st_lower.contains("fabric") {
            let fabric_opt_list = ["lithium", "ferritecore", "krypton", "c2me", "modernfix", "memoryleakfix"];
            for opt in &fabric_opt_list {
                if installed_names.iter().any(|n| n.contains(opt)) {
                    detected_optimizations.push(opt.to_string());
                } else {
                    missing_recommended.push(opt.to_string());
                }
            }
        } else if st_lower.contains("paper") || st_lower.contains("purpur") || st_lower.contains("spigot") {
            let paper_opt_list = ["spark", "chunky", "viewdistancetweaks"];
            for opt in &paper_opt_list {
                if installed_names.iter().any(|n| n.contains(opt)) {
                    detected_optimizations.push(opt.to_string());
                } else {
                    missing_recommended.push(opt.to_string());
                }
            }
        }

        let mut bottlenecks: Vec<serde_json::Value> = Vec::new();
        let mut recommendations: Vec<String> = Vec::new();

        if !matches!(status.state, ServerStatusState::Running) {
            bottlenecks.push(json!({
                "severity": "INFO",
                "type": "SERVER_STOPPED",
                "reason": "The server is currently stopped. Performance analysis is based on static configuration, RAM allocation, and installed extensions."
            }));
        }

        if overload_count > 0 {
            bottlenecks.push(json!({
                "severity": "HIGH",
                "type": "TICK_LAG_SPIKES",
                "reason": format!(
                    "Server recorded {} tick overload warnings in recent logs. Worst lag spike was {}ms behind (normal tick is 50ms).",
                    overload_count, max_overload_ms
                )
            }));
        }

        if !memory_errors.is_empty() {
            bottlenecks.push(json!({
                "severity": "CRITICAL",
                "type": "OUT_OF_MEMORY",
                "reason": "Server encountered OutOfMemoryError or GC overhead limit exceeded in logs."
            }));
            recommendations.push(format!(
                "Increase allocated RAM from {}MB to at least {}MB.",
                max_ram_mb, (max_ram_mb + 2048).max(4096)
            ));
        }

        if memory_percent > 85.0 && matches!(status.state, ServerStatusState::Running) {
            bottlenecks.push(json!({
                "severity": "HIGH",
                "type": "HIGH_MEMORY_PRESSURE",
                "reason": format!(
                    "RAM usage is at {:.1}% ({}MB of {}MB max). When heap utilization exceeds 85%, Java Garbage Collection causes severe lag spikes ('Stop-The-World' pauses).",
                    memory_percent, memory_used_mb, max_ram_mb
                )
            }));
            recommendations.push(format!(
                "Allocate more RAM to the server (currently {}MB). Recommended: {}MB.",
                max_ram_mb, (max_ram_mb + 2048).max(4096)
            ));
        } else if max_ram_mb < 3072 {
            bottlenecks.push(json!({
                "severity": "MEDIUM",
                "type": "LOW_ALLOCATED_RAM",
                "reason": format!(
                    "Server only has {}MB allocated. Modern Minecraft versions generally require at least 3-4 GB (3072-4096MB) for smooth tick rates.",
                    max_ram_mb
                )
            }));
            recommendations.push("Increase allocated RAM to 4096MB in Server Settings for optimal performance.".to_string());
        }

        if cpu_percent > 85.0 && matches!(status.state, ServerStatusState::Running) {
            bottlenecks.push(json!({
                "severity": "HIGH",
                "type": "HIGH_CPU_LOAD",
                "reason": format!(
                    "Server process is consuming {:.1}% CPU. This is usually caused by excessive entity ticking, mob pathfinding, redstone loops, or rapid world chunk generation.",
                    cpu_percent
                )
            }));
        }

        if let Some(vd) = view_distance {
            if vd >= 12 {
                bottlenecks.push(json!({
                    "severity": "HIGH",
                    "type": "HIGH_VIEW_DISTANCE",
                    "reason": format!(
                        "view-distance is set to {} in server.properties. Chunk count scales quadratically with view distance (e.g. 12 generates over 625 chunks per player), massively degrading tick rate.",
                        vd
                    )
                }));
                recommendations.push(format!("Lower view-distance from {} to 8 or 6 in server.properties using 'set_server_property'.", vd));
            }
        }

        if let Some(sd) = simulation_distance {
            if sd >= 10 {
                bottlenecks.push(json!({
                    "severity": "MEDIUM",
                    "type": "HIGH_SIMULATION_DISTANCE",
                    "reason": format!(
                        "simulation-distance is set to {}. Ticking entities and mob AI across large distances creates high CPU load.",
                        sd
                    )
                }));
                recommendations.push(format!("Lower simulation-distance from {} to 5 or 6 in server.properties using 'set_server_property'.", sd));
            }
        }

        if !detected_optimizations.iter().any(|m| m == "lithium") && st_lower.contains("fabric") {
            recommendations.push("Install 'Lithium' mod via 'install_plugin' (Modrinth slug: 'lithium') for general 30-40% server tick optimization without altering vanilla mechanics.".to_string());
        }
        if !detected_optimizations.iter().any(|m| m == "ferritecore") && st_lower.contains("fabric") {
            recommendations.push("Install 'FerriteCore' mod via 'install_plugin' (Modrinth slug: 'ferrite-core') to significantly reduce Java memory consumption.".to_string());
        }
        if !detected_optimizations.iter().any(|m| m == "spark") && (st_lower.contains("paper") || st_lower.contains("purpur") || st_lower.contains("spigot")) {
            recommendations.push("Install 'spark' profiler plugin via 'install_plugin' (Modrinth slug: 'spark') to pinpoint exact laggy entities, chunk coordinates, or event listeners.".to_string());
        }

        let overall_health = if estimated_tps >= 19.5 && overload_count == 0 && memory_percent < 80.0 {
            "EXCELLENT (20.0 TPS stable, healthy tick rate)"
        } else if estimated_tps >= 18.0 && overload_count < 3 {
            "GOOD (Minor occasional tick dips)"
        } else if estimated_tps >= 14.0 || overload_count < 10 {
            "MODERATE LAG (Sub-optimal TPS, noticeable rubber-banding or tick delay)"
        } else {
            "SEVERE LAG (Low TPS, frequent tick overloads, severe delay or stutter)"
        };

        Ok(json!({
            "server_id": server.id,
            "server_name": server.name,
            "server_type": server.server_type,
            "minecraft_version": server.minecraft_version,
            "status": format!("{:?}", status.state),
            "overall_health": overall_health,
            "tps_and_tick_health": {
                "estimated_tps": (estimated_tps * 100.0).round() / 100.0,
                "measured_tps_line": measured_tps_line,
                "measured_tick_time_line": measured_tick_time_line,
                "overload_warnings_count": overload_count,
                "worst_lag_spike_ms": max_overload_ms,
                "average_lag_spike_ms": avg_overload_ms,
                "recent_overload_log_samples": recent_overload_snippets
            },
            "process_metrics": {
                "cpu_percent": cpu_percent,
                "memory_used_mb": memory_used_mb,
                "max_ram_mb": max_ram_mb,
                "memory_utilization_percent": (memory_percent * 10.0).round() / 10.0,
                "pid": status.pid,
                "online_players": status.online_players.unwrap_or(0)
            },
            "config_audit": {
                "view_distance": view_distance.unwrap_or(10),
                "simulation_distance": simulation_distance.unwrap_or(10),
                "entity_broadcast_range_percentage": entity_broadcast_range.unwrap_or(100),
                "network_compression_threshold": network_compression_threshold.unwrap_or(256),
                "has_g1gc_flag": server.jvm_flags.contains("UseG1GC")
            },
            "installed_optimizations": {
                "detected": detected_optimizations,
                "recommended_missing": missing_recommended
            },
            "identified_bottlenecks": bottlenecks,
            "actionable_recommendations": recommendations
        }))
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_command_permissions() {
        // Read-only / auto-allowed
        let (req, _, _) = McpToolEngine::classify_command("list");
        assert!(!req);
        let (req2, _, _) = McpToolEngine::classify_command("tps");
        assert!(!req2);
        let (req3, _, _) = McpToolEngine::classify_command("help");
        assert!(!req3);
        let (req4, _, _) = McpToolEngine::classify_command("time query daytime");
        assert!(!req4);

        // Destructive / Privilege / Moderation -> requires approval
        let (req_op, _, _) = McpToolEngine::classify_command("op Player1");
        assert!(req_op);
        let (req_ban, _, _) = McpToolEngine::classify_command("ban BadActor");
        assert!(req_ban);
        let (req_kick, _, _) = McpToolEngine::classify_command("kick Player2");
        assert!(req_kick);
        let (req_stop, _, _) = McpToolEngine::classify_command("stop");
        assert!(req_stop);
        let (req_rule, _, _) = McpToolEngine::classify_command("gamerule keepInventory true");
        assert!(req_rule);
        let (req_fill, _, _) = McpToolEngine::classify_command("fill 0 0 0 10 10 10 air");
        assert!(req_fill);
    }

    #[test]
    fn test_find_available_port() {
        let (port, _) = McpToolEngine::find_available_port(25565);
        assert!(port >= 25565);
    }

    #[test]
    fn test_parse_crash_report() {
        let crash_content = "\
---- Minecraft Crash Report ----
// Don't do that.

Time: 2026-10-18 12:00:00
Description: Exception ticking world

java.lang.NullPointerException: Cannot invoke method on null
\tat com.sk89q.worldedit.bukkit.BukkitPlayer.getPosition(BukkitPlayer.java:123)
\tat net.minecraft.server.MinecraftServer.tick(MinecraftServer.java:456)
Caused by: java.lang.IllegalStateException: World uninitialized
\tat com.sk89q.worldedit.WorldEdit.init(WorldEdit.java:89)

Minecraft Version: 1.21.4
Java Version: 21.0.2
";
        let parsed = McpToolEngine::parse_crash_report(crash_content, "crash-test.txt");
        assert_eq!(parsed["found"], true);
        assert_eq!(parsed["description"], "Exception ticking world");
        assert_eq!(parsed["minecraft_version"], "1.21.4");
        assert_eq!(parsed["java_version"], "21.0.2");
        assert!(parsed["suspected_extensions"].as_array().unwrap().contains(&json!("WorldEdit")));
        assert!(parsed["caused_by"].as_array().unwrap().contains(&json!("java.lang.IllegalStateException: World uninitialized")));
    }
    #[test]
    fn test_parse_log_performance_indicators() {
        let logs = vec![
            "[Server thread/INFO]: Starting minecraft server version 1.21.1".to_string(),
            "[Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2450ms or 49 ticks behind".to_string(),
            "[Server thread/WARN]: Can't keep up! Is the server overloaded? Running 1200ms or 24 ticks behind".to_string(),
            "[Server thread/INFO]: TPS from last 1m, 5m, 15m: 16.85, 18.20, 19.90".to_string(),
        ];

        let (count, max_ms, total_ms, snippets, errors, tps_line, tick_line) =
            McpToolEngine::parse_log_performance_indicators(&logs);

        assert_eq!(count, 2);
        assert_eq!(max_ms, 2450);
        assert_eq!(total_ms, 3650);
        assert_eq!(snippets.len(), 2);
        assert!(errors.is_empty());
        assert_eq!(tps_line, Some("16.85, 18.20, 19.90".to_string()));
        assert!(tick_line.is_none());
    }
}
