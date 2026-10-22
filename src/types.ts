export type ServerType =
  | "paper"
  | "purpur"
  | "spigot"
  | "fabric"
  | "forge"
  | "neoforge"
  | "arclight"
  | "vanilla"
  | "quilt";

export interface MinecraftVersionEntry {
  id: string;
  type: "release" | "snapshot" | "old_beta" | "old_alpha" | string;
  url: string;
  time: string;
  releaseTime: string;
  sha1: string;
  complianceLevel?: number;
}

export interface VersionManifest {
  latest: {
    release: string;
    snapshot: string;
  };
  versions: MinecraftVersionEntry[];
  cached_at?: number;
  is_stale?: boolean;
}

export interface ProviderBuildInfo {
  provider: ServerType;
  minecraft_version: string;
  build_id: string;
  download_url: string;
  filename: string;
  file_size?: number;
  checksum_type?: string;
  checksum_value?: string;
  is_installer: boolean;
  installer_args?: string[];
  target_jar: string;
  required_java_major?: number;
}

export interface DownloadProgressPayload {
  server_id?: string;
  status: string;
  progress_percent?: number;
  bytes_downloaded: number;
  total_bytes?: number;
  message: string;
}

export type ServerStatusState = "stopped" | "starting" | "running" | "stopping" | "crashed";

export interface ServerStatus {
  state: ServerStatusState;
  pid?: number | null;
  port: number;
  online_players?: number | null;
  max_players?: number | null;
  memory_used_mb?: number | null;
  cpu_percent?: number | null;
  exit_code?: number | null;
  error_message?: string | null;
}

export interface ServerProfile {
  id: string;
  name: string;
  server_type: ServerType;
  minecraft_version: string;
  java_path?: string | null;
  min_ram_mb: number;
  max_ram_mb: number;
  jvm_flags: string;
  server_dir: string;
  jar_file: string;
  port: number;
  eula_accepted: boolean;
  autostart: boolean;
  created_at: number;
  updated_at: number;
}

export interface CreateServerRequest {
  name: string;
  server_type: ServerType;
  minecraft_version: string;
  java_path?: string | null;
  min_ram_mb?: number;
  max_ram_mb?: number;
  jvm_flags?: string;
  port?: number;
  accept_eula: boolean;
  online_mode?: boolean;
  import_mode?: "fresh" | "zip" | "directory";
  import_zip_path?: string | null;
  existing_dir_path?: string | null;
}

export interface JavaRuntime {
  path: string;
  major_version: number;
  version_str: string;
  vendor: string;
  is_valid: boolean;
  is_recommended: boolean;
}

export interface JdkDownloadProgress {
  major_version: number;
  step: string;
  percent: number;
  downloaded_bytes: number;
  total_bytes: number;
}

export interface ServerConfigItem {
  key: string;
  value: string;
  default_value?: string | null;
  data_type: "string" | "number" | "boolean" | "select" | string;
  category: string;
  description: string;
  restart_required: boolean;
  allowed_values?: string[] | null;
}

export interface ConfigDiff {
  key: string;
  old_value: string;
  new_value: string;
}

export interface ExtensionItem {
  file_name: string;
  name: string;
  version?: string | null;
  extension_type: "plugin" | "mod" | string;
  enabled: boolean;
  file_size_bytes: number;
  modified_at: number;
}

export interface ModrinthProjectHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  client_side: string;
  server_side: string;
  icon_url?: string | null;
  downloads: number;
  author: string;
  versions: string[];
}

export interface ModrinthSearchResponse {
  hits: ModrinthProjectHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthVersionFile {
  hashes: {
    sha1?: string | null;
    sha512?: string | null;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  files: ModrinthVersionFile[];
  date_published: string;
}

export interface BackupRecord {
  id: string;
  server_id: string;
  file_name: string;
  file_size_bytes: number;
  created_at: number;
  description: string;
}

export interface OperationRecord {
  id: string;
  server_id?: string | null;
  operation_type: string;
  details: string;
  success: boolean;
  timestamp: number;
}

export interface AiProviderConfig {
  provider: string; // "openai" | "gemini" | "anthropic" | "ollama" | "openrouter" | "custom"
  api_key: string;
  model: string;
  base_url?: string | null;
}

export interface McpToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiChatMessage {
  role: "system" | "user" | "assistant" | "tool" | string;
  content: string;
  tool_calls?: McpToolCall[] | null;
  tool_call_id?: string | null;
}

export interface AiChatEvent {
  event_type: "thought" | "tool_call" | "tool_result" | "message" | "done" | "error" | string;
  content?: string | null;
  tool_name?: string | null;
  tool_call_id?: string | null;
  step_description?: string | null;
  is_final: boolean;
}

export interface AiChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AiChatMessage[];
  serverId?: string;
}

export interface NetworkAddresses {
  local_ip: string;
  lan_ip?: string | null;
}

export type PortalTunnelState =
  | { state: "stopped" }
  | { state: "starting" }
  | { state: "connecting" }
  | {
      state: "ready";
      data?: {
        public_address: string;
        relay_url?: string | null;
      };
    }
  | {
      state: "connected";
      data?: {
        public_address: string;
        local_port: number;
        relay_url?: string | null;
        last_verified_at: number;
      };
    }
  | { state: "stopping" }
  | { state: "error"; data?: { stage: string; message: string } };

export interface PortalServerStatus {
  server_id: string;
  status: PortalTunnelState;
  local_port: number;
  public_address?: string | null;
  relay_url?: string | null;
  is_running: boolean;
  is_verified?: boolean;
  last_verified_at?: number | null;
  last_error?: string | null;
}

export interface PendingCommandApproval {
  approval_id: string;
  server_id: string;
  command: string;
  explanation: string;
  potential_impact: string;
  category: string;
  created_at: number;
  expires_at: number;
}

export type ModpackProvider = "modrinth" | "curseforge";

export interface ModpackProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  icon_url?: string | null;
  downloads: number;
  follows: number;
  categories: string[];
  loaders: string[];
  game_versions: string[];
  latest_version?: string | null;
  provider: ModpackProvider | string;
}

export interface ModpackSearchResponse {
  hits: ModpackProject[];
  total_hits: number;
  offset: number;
  limit: number;
  provider: string;
}

export interface ModpackVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  hashes: Record<string, string>;
}

export interface ModpackVersionInfo {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  date_published: string;
  download_url: string;
  filename: string;
  file_size: number;
  files: ModpackVersionFile[];
  changelog?: string | null;
  server_pack_available?: boolean;
}

export interface InstallModpackRequest {
  install_id: string;
  name: string;
  provider: string;
  project_id: string;
  version_id: string;
  download_url: string;
  port?: number;
  min_ram_mb?: number;
  max_ram_mb?: number;
  accept_eula: boolean;
  java_path?: string | null;
  jvm_flags?: string | null;
  custom_dir?: string | null;
  curseforge_api_key?: string | null;
  local_archive_path?: string | null;
  online_mode?: boolean;
}

export interface ModpackInstallProgress {
  install_id: string;
  step: string;
  progress_percent: number;
  details: string;
  current_file?: string | null;
  files_completed: number;
  total_files: number;
  bytes_downloaded: number;
  total_bytes: number;
}




export interface WhitelistPlayer {
  uuid?: string;
  name: string;
}

export interface OpPlayer {
  uuid?: string;
  name: string;
  level?: number;
  bypasses_player_limit?: boolean;
}

export interface BannedPlayer {
  uuid?: string;
  name: string;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}

export interface BannedIp {
  ip: string;
  created?: string;
  source?: string;
  expires?: string;
  reason?: string;
}

export interface KnownPlayer {
  name: string;
  uuid?: string | null;
  is_online: boolean;
  is_op: boolean;
  op_level?: number | null;
  is_whitelisted: boolean;
  is_banned: boolean;
  ban_reason?: string | null;
  last_seen?: string | null;
}

export interface ServerPlayerData {
  players: KnownPlayer[];
  whitelist: WhitelistPlayer[];
  ops: OpPlayer[];
  banned_players: BannedPlayer[];
  banned_ips: BannedIp[];
  whitelist_enabled: boolean;
  is_server_running: boolean;
}

export interface WorldDetails {
  level_name: string;
  level_seed?: string | null;
  total_size_mb: number;
  overworld_size_mb: number;
  nether_size_mb: number;
  end_size_mb: number;
  nether_exists: boolean;
  end_exists: boolean;
  is_server_running: boolean;
}

export interface FileEntry {
  name: string;
  relative_path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_ms: number;
  extension?: string | null;
}
