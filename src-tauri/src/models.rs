use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerType {
    Paper,
    Purpur,
    Spigot,
    Fabric,
    Forge,
    NeoForge,
    Arclight,
    Vanilla,
    Quilt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MinecraftVersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String, // "release", "snapshot", "old_beta", "old_alpha"
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime", alias = "release_time")]
    pub release_time: String,
    pub sha1: String,
    #[serde(rename = "complianceLevel", alias = "compliance_level", default)]
    pub compliance_level: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: VersionManifestLatest,
    pub versions: Vec<MinecraftVersionEntry>,
    pub cached_at: Option<i64>,
    pub is_stale: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifestLatest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderBuildInfo {
    pub provider: ServerType,
    pub minecraft_version: String,
    pub build_id: String,
    pub download_url: String,
    pub filename: String,
    pub file_size: Option<u64>,
    pub checksum_type: Option<String>, // "sha1", "sha256", "sha512"
    pub checksum_value: Option<String>,
    pub is_installer: bool,
    pub installer_args: Option<Vec<String>>,
    pub target_jar: String,
    pub required_java_major: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgressPayload {
    pub server_id: Option<String>,
    pub status: String, // "fetching_metadata", "downloading", "verifying", "installing", "ready", "error"
    pub progress_percent: Option<f32>,
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub message: String,
}

impl Default for ServerType {
    fn default() -> Self {
        ServerType::Paper
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerStatusState {
    Stopped,
    Starting,
    Running,
    Stopping,
    Crashed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub state: ServerStatusState,
    pub pid: Option<u32>,
    pub port: u16,
    pub online_players: Option<u32>,
    pub max_players: Option<u32>,
    pub memory_used_mb: Option<u64>,
    pub cpu_percent: Option<f32>,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerProfile {
    pub id: String,
    pub name: String,
    pub server_type: ServerType,
    pub minecraft_version: String,
    pub java_path: Option<String>,
    pub min_ram_mb: u32,
    pub max_ram_mb: u32,
    pub jvm_flags: String,
    pub server_dir: String,
    pub jar_file: String,
    pub port: u16,
    pub eula_accepted: bool,
    pub autostart: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateServerRequest {
    pub name: String,
    pub server_type: ServerType,
    pub minecraft_version: String,
    pub java_path: Option<String>,
    pub min_ram_mb: Option<u32>,
    pub max_ram_mb: Option<u32>,
    pub jvm_flags: Option<String>,
    pub port: Option<u16>,
    pub accept_eula: bool,
    pub online_mode: Option<bool>,
    // Import options
    pub import_mode: Option<String>, // "fresh" | "zip" | "directory"
    pub import_zip_path: Option<String>,
    pub existing_dir_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaRuntime {
    pub path: String,
    pub major_version: u32,
    pub version_str: String,
    pub vendor: String,
    pub is_valid: bool,
    pub is_recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JdkDownloadProgress {
    pub major_version: u32,
    pub step: String,
    pub percent: f32,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfigItem {
    pub key: String,
    pub value: String,
    pub default_value: Option<String>,
    pub data_type: String, // "string", "number", "boolean", "select"
    pub category: String,  // "General", "Gameplay", "World", "Network", "Security", "Advanced"
    pub description: String,
    pub restart_required: bool,
    pub allowed_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigDiff {
    pub key: String,
    pub old_value: String,
    pub new_value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionItem {
    pub file_name: String,
    pub name: String,
    pub version: Option<String>,
    pub extension_type: String, // "plugin" or "mod"
    pub enabled: bool,
    pub file_size_bytes: u64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub id: String,
    pub server_id: String,
    pub file_name: String,
    pub file_size_bytes: u64,
    pub created_at: i64,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationRecord {
    pub id: String,
    pub server_id: Option<String>,
    pub operation_type: String,
    pub details: String,
    pub success: bool,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderConfig {
    pub provider: String, // "openai", "gemini", "anthropic", "ollama", "openrouter", "custom"
    pub api_key: String,
    pub model: String,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String, // "system", "user", "assistant", "tool"
    pub content: String,
    pub tool_calls: Option<Vec<McpToolCall>>,
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolResult {
    pub tool_call_id: String,
    pub name: String,
    pub success: bool,
    pub output: serde_json::Value,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatEvent {
    pub event_type: String, // "thought" | "tool_call" | "tool_result" | "message" | "done" | "error"
    pub content: Option<String>,
    pub tool_name: Option<String>,
    pub tool_call_id: Option<String>,
    pub step_description: Option<String>,
    pub is_final: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "state", content = "data", rename_all = "snake_case")]
pub enum PortalTunnelState {
    Stopped,
    Starting,
    Connecting,
    Ready {
        public_address: String,
        relay_url: Option<String>,
    },
    Connected {
        public_address: String,
        local_port: u16,
        relay_url: Option<String>,
        last_verified_at: i64,
    },
    Stopping,
    Error {
        stage: String,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortalServerStatus {
    pub server_id: String,
    pub status: PortalTunnelState,
    pub local_port: u16,
    pub public_address: Option<String>,
    pub relay_url: Option<String>,
    pub is_running: bool,
    pub is_verified: bool,
    pub last_verified_at: Option<i64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingCommandApproval {
    pub id: String,
    pub server_id: String,
    pub server_name: String,
    pub command: String,
    pub explanation: String,
    pub impact: String,
    pub created_at: i64,
    pub expires_at: i64,
}

// -----------------------------------------------------------------------------
// Modpack Server Creation & Installation Models
// -----------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackProject {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u64,
    pub categories: Vec<String>,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub latest_version: Option<String>,
    pub provider: String, // "modrinth" or "curseforge"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackSearchResponse {
    pub hits: Vec<ModpackProject>,
    pub total_hits: u64,
    pub offset: u32,
    pub limit: u32,
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackVersionFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackVersionInfo {
    pub id: String,
    pub name: String,
    pub version_number: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub date_published: String,
    pub download_url: String,
    pub filename: String,
    pub file_size: u64,
    pub files: Vec<ModpackVersionFile>,
    pub changelog: Option<String>,
    pub server_pack_available: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallModpackRequest {
    pub install_id: String,
    pub name: String,
    pub provider: String,
    pub project_id: String,
    pub version_id: String,
    pub download_url: String,
    pub port: Option<u16>,
    pub min_ram_mb: Option<u32>,
    pub max_ram_mb: Option<u32>,
    pub accept_eula: bool,
    pub java_path: Option<String>,
    pub jvm_flags: Option<String>,
    pub custom_dir: Option<String>,
    pub curseforge_api_key: Option<String>,
    pub local_archive_path: Option<String>,
    pub online_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModpackInstallProgress {
    pub install_id: String,
    pub step: String,
    pub progress_percent: f32,
    pub details: String,
    pub current_file: Option<String>,
    pub files_completed: u32,
    pub total_files: u32,
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthIndex {
    #[serde(rename = "formatVersion")]
    pub format_version: u32,
    pub game: String,
    #[serde(rename = "versionId")]
    pub version_id: String,
    pub name: String,
    pub summary: Option<String>,
    pub files: Vec<ModrinthIndexFile>,
    pub dependencies: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModrinthIndexFile {
    pub path: String,
    pub hashes: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub env: Option<ModrinthFileEnv>,
    pub downloads: Vec<String>,
    #[serde(rename = "fileSize")]
    pub file_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModrinthFileEnv {
    #[serde(default)]
    pub client: Option<String>, // "required", "optional", "unsupported"
    #[serde(default)]
    pub server: Option<String>, // "required", "optional", "unsupported"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeManifest {
    pub minecraft: CurseForgeMinecraftInfo,
    #[serde(rename = "manifestType")]
    pub manifest_type: String,
    #[serde(rename = "manifestVersion")]
    pub manifest_version: u32,
    pub name: String,
    pub version: String,
    pub author: String,
    #[serde(default)]
    pub files: Vec<CurseForgeFileRef>,
    pub overrides: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeMinecraftInfo {
    pub version: String,
    #[serde(rename = "modLoaders", default)]
    pub mod_loaders: Vec<CurseForgeModLoaderInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeModLoaderInfo {
    pub id: String,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurseForgeFileRef {
    #[serde(rename = "projectID")]
    pub project_id: u32,
    #[serde(rename = "fileID")]
    pub file_id: u32,
    pub required: bool,
}



#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhitelistPlayer {
    pub uuid: Option<String>,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpPlayer {
    pub uuid: Option<String>,
    pub name: String,
    pub level: Option<u8>,
    pub bypasses_player_limit: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannedPlayer {
    pub uuid: Option<String>,
    pub name: String,
    pub created: Option<String>,
    pub source: Option<String>,
    pub expires: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannedIp {
    pub ip: String,
    pub created: Option<String>,
    pub source: Option<String>,
    pub expires: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownPlayer {
    pub name: String,
    pub uuid: Option<String>,
    pub is_online: bool,
    pub is_op: bool,
    pub op_level: Option<u8>,
    pub is_whitelisted: bool,
    pub is_banned: bool,
    pub ban_reason: Option<String>,
    pub last_seen: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPlayerData {
    pub players: Vec<KnownPlayer>,
    pub whitelist: Vec<WhitelistPlayer>,
    pub ops: Vec<OpPlayer>,
    pub banned_players: Vec<BannedPlayer>,
    pub banned_ips: Vec<BannedIp>,
    pub whitelist_enabled: bool,
    pub is_server_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldDetails {
    pub level_name: String,
    pub level_seed: Option<String>,
    pub total_size_mb: f64,
    pub overworld_size_mb: f64,
    pub nether_size_mb: f64,
    pub end_size_mb: f64,
    pub nether_exists: bool,
    pub end_exists: bool,
    pub is_server_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_ms: u64,
    pub extension: Option<String>,
}
