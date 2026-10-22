import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AiChatEvent,
  AiChatMessage,
  AiProviderConfig,
  BackupRecord,
  ConfigDiff,
  CreateServerRequest,
  DownloadProgressPayload,
  ExtensionItem,
  InstallModpackRequest,
  JavaRuntime,
  JdkDownloadProgress,
  McpToolCall,
  ModpackInstallProgress,
  ModpackSearchResponse,
  ModpackVersionInfo,
  ModrinthSearchResponse,
  ModrinthVersion,
  NetworkAddresses,
  OperationRecord,
  PendingCommandApproval,
  PortalServerStatus,
  ProviderBuildInfo,
  ServerConfigItem,
  ServerProfile,
  ServerStatus,
  ServerType,
  VersionManifest,
  FileEntry,
  ServerPlayerData,
  WorldDetails,
} from "../types";

export const api = {
  // Server Management
  listServers: async (): Promise<ServerProfile[]> => {
    return invoke("list_servers");
  },

  getServer: async (serverId: string): Promise<ServerProfile | null> => {
    return invoke("get_server", { serverId });
  },

  createServer: async (req: CreateServerRequest): Promise<ServerProfile> => {
    return invoke("create_server", { req });
  },

  updateServerProfile: async (profile: ServerProfile): Promise<ServerProfile> => {
    return invoke("update_server_profile", { profile });
  },

  deleteServer: async (serverId: string, deleteFiles: boolean): Promise<boolean> => {
    return invoke("delete_server", { serverId, deleteFiles });
  },

  // Lifecycle
  startServer: async (serverId: string): Promise<boolean> => {
    return invoke("start_server", { serverId });
  },

  stopServer: async (serverId: string): Promise<boolean> => {
    return invoke("stop_server", { serverId });
  },

  restartServer: async (serverId: string): Promise<boolean> => {
    return invoke("restart_server", { serverId });
  },

  sendConsoleCommand: async (serverId: string, command: string): Promise<boolean> => {
    return invoke("send_console_command", { serverId, command });
  },

  getServerStatus: async (serverId: string): Promise<ServerStatus> => {
    return invoke("get_server_status", { serverId });
  },

  getServerLogs: async (serverId: string): Promise<string[]> => {
    return invoke("get_server_logs", { serverId });
  },

  listenConsole: async (serverId: string, callback: (payload: { line: string; is_error: boolean }) => void) => {
    return listen<{ line: string; is_error: boolean }>(`server-console:${serverId}`, (event) => {
      callback(event.payload);
    });
  },

  // Java
  detectJavaRuntimes: async (): Promise<JavaRuntime[]> => {
    return invoke("detect_java_runtimes");
  },

  downloadJavaRuntime: async (majorVersion: number): Promise<JavaRuntime> => {
    return invoke("download_java_runtime", { majorVersion });
  },

  autoFixServerJava: async (
    serverId: string,
    targetMajor?: number
  ): Promise<ServerProfile> => {
    return invoke("auto_fix_server_java", { serverId, targetMajor });
  },

  listenJdkProgress: async (
    callback: (progress: JdkDownloadProgress) => void
  ) => {
    return listen<JdkDownloadProgress>("jdk-download-progress", (event) => {
      callback(event.payload);
    });
  },

  // Configuration
  getServerConfig: async (serverId: string): Promise<ServerConfigItem[]> => {
    return invoke("get_server_config", { serverId });
  },

  proposeServerConfig: async (
    serverId: string,
    updates: Record<string, string>
  ): Promise<ConfigDiff[]> => {
    return invoke("propose_server_config", { serverId, updates });
  },

  applyServerConfig: async (
    serverId: string,
    updates: Record<string, string>
  ): Promise<ConfigDiff[]> => {
    return invoke("apply_server_config", { serverId, updates });
  },

  readRawConfig: async (serverId: string, fileName: string): Promise<string> => {
    return invoke("read_raw_config", { serverId, fileName });
  },

  writeRawConfig: async (serverId: string, fileName: string, content: string): Promise<boolean> => {
    return invoke("write_raw_config", { serverId, fileName, content });
  },

  // Extensions (Plugins / Mods)
  listExtensions: async (serverId: string): Promise<ExtensionItem[]> => {
    return invoke("list_extensions", { serverId });
  },

  toggleExtension: async (serverId: string, fileName: string): Promise<string> => {
    return invoke("toggle_extension", { serverId, fileName });
  },

  removeExtension: async (serverId: string, fileName: string): Promise<boolean> => {
    return invoke("remove_extension", { serverId, fileName });
  },

  searchModrinth: async (
    serverId: string,
    query: string,
    index?: string,
    offset?: number
  ): Promise<ModrinthSearchResponse> => {
    return invoke("search_modrinth", { serverId, query, index, offset });
  },

  getModrinthVersions: async (serverId: string, projectId: string): Promise<ModrinthVersion[]> => {
    return invoke("get_modrinth_versions", { serverId, projectId });
  },

  installModrinthExtension: async (
    serverId: string,
    versionFileUrl: string,
    filename: string,
    sha512?: string
  ): Promise<string> => {
    return invoke("install_modrinth_extension", {
      serverId,
      versionFileUrl,
      filename,
      sha512,
    });
  },

  // Backups
  listBackups: async (serverId: string): Promise<BackupRecord[]> => {
    return invoke("list_backups", { serverId });
  },

  createBackup: async (serverId: string, description: string): Promise<BackupRecord> => {
    return invoke("create_backup", { serverId, description });
  },

  restoreBackup: async (serverId: string, fileName: string): Promise<boolean> => {
    return invoke("restore_backup", { serverId, fileName });
  },

  deleteBackup: async (serverId: string, backupId: string, fileName: string): Promise<boolean> => {
    return invoke("delete_backup", { serverId, backupId, fileName });
  },

  // Operations
  listOperations: async (serverId?: string): Promise<OperationRecord[]> => {
    return invoke("list_operations", { serverId });
  },

  // AI & MCP
  getAiConfig: async (): Promise<AiProviderConfig> => {
    return invoke("get_ai_config");
  },

  saveAiConfig: async (config: AiProviderConfig): Promise<boolean> => {
    return invoke("save_ai_config", { config });
  },

  chatWithAi: async (
    messages: AiChatMessage[],
    activeServerId?: string
  ): Promise<AiChatMessage[]> => {
    return invoke("chat_with_ai", { messages, activeServerId });
  },

  stopAi: async (): Promise<boolean> => {
    return invoke("stop_ai");
  },

  listenAiEvents: async (callback: (event: AiChatEvent) => void) => {
    return listen<AiChatEvent>("ai-chat-event", (e) => {
      callback(e.payload);
    });
  },

  executeMcpTool: async (call: McpToolCall): Promise<unknown> => {
    return invoke("execute_mcp_tool", { call });
  },

  getMcpTools: async (): Promise<unknown[]> => {
    return invoke("get_mcp_tools");
  },

  approveConsoleCommand: async (approvalId: string): Promise<string> => {
    return invoke("approve_console_command", { approvalId });
  },

  rejectConsoleCommand: async (approvalId: string): Promise<boolean> => {
    return invoke("reject_console_command", { approvalId });
  },

  listPendingApprovals: async (): Promise<PendingCommandApproval[]> => {
    return invoke("list_pending_approvals");
  },

  // Version Manifest & Software Provider
  getMinecraftVersions: async (forceRefresh = false): Promise<VersionManifest> => {
    return invoke("get_minecraft_versions", { forceRefresh });
  },

  getMinecraftRequiredJava: async (minecraftVersion: string): Promise<number> => {
    return invoke("get_minecraft_required_java", { minecraftVersion });
  },

  resolveProviderBuild: async (
    provider: ServerType,
    minecraftVersion: string
  ): Promise<ProviderBuildInfo> => {
    return invoke("resolve_provider_build", {
      provider,
      minecraftVersion,
    });
  },

  listenDownloadProgress: async (
    callback: (payload: DownloadProgressPayload) => void
  ) => {
    return listen<DownloadProgressPayload>("server-download-progress", (event) => {
      callback(event.payload);
    });
  },

  openServerDirectory: async (serverId: string): Promise<boolean> => {
    return invoke("open_server_directory", { serverId });
  },

  openBrowserUrl: async (url: string): Promise<boolean> => {
    return invoke("open_browser_url", { url });
  },

  getNetworkAddresses: async (): Promise<NetworkAddresses> => {
    return invoke("get_network_addresses");
  },

  // Portal Raw TCP Public Access Integration (gosuda/portal-tunnel)
  startPortalTunnel: async (serverId: string): Promise<PortalServerStatus> => {
    return invoke("start_portal_tunnel", { serverId });
  },

  stopPortalTunnel: async (serverId: string): Promise<PortalServerStatus> => {
    return invoke("stop_portal_tunnel", { serverId });
  },

  getPortalStatus: async (serverId: string): Promise<PortalServerStatus> => {
    return invoke("get_portal_status", { serverId });
  },

  getPortalLogs: async (serverId: string): Promise<string[]> => {
    return invoke("get_portal_logs", { serverId });
  },

  verifyPortalConnectivity: async (serverId: string): Promise<PortalServerStatus> => {
    return invoke("verify_portal_connectivity", { serverId });
  },

  listenPortalStatus: async (callback: (status: PortalServerStatus) => void) => {
    return listen<PortalServerStatus>("portal-status-changed", (event) => {
      callback(event.payload);
    });
  },
  // Modpack Server Creation & Installation
  searchModpacks: async (
    provider: string,
    query: string,
    minecraftVersion?: string,
    loader?: string,
    offset: number = 0,
    limit: number = 20,
    curseforgeApiKey?: string
  ): Promise<ModpackSearchResponse> => {
    return invoke("search_modpacks", {
      provider,
      query,
      minecraftVersion: minecraftVersion || null,
      loader: loader || null,
      offset,
      limit,
      curseforgeApiKey: curseforgeApiKey || null,
    });
  },

  getModpackVersions: async (
    provider: string,
    projectId: string,
    curseforgeApiKey?: string
  ): Promise<ModpackVersionInfo[]> => {
    return invoke("get_modpack_versions", {
      provider,
      projectId,
      curseforgeApiKey: curseforgeApiKey || null,
    });
  },

  installModpackServer: async (
    req: InstallModpackRequest
  ): Promise<ServerProfile> => {
    return invoke("install_modpack_server", { req });
  },

  cancelModpackInstall: async (installId: string): Promise<void> => {
    return invoke("cancel_modpack_install", { installId });
  },

  listenModpackProgress: async (
    callbackOrInstallId: string | ((progress: ModpackInstallProgress) => void),
    maybeCallback?: (progress: ModpackInstallProgress) => void
  ) => {
    if (typeof callbackOrInstallId === "function") {
      return listen<ModpackInstallProgress>(
        "modpack-install-progress",
        (event) => {
          callbackOrInstallId(event.payload);
        }
      );
    }
    const installId = callbackOrInstallId;
    return listen<ModpackInstallProgress>(
      `modpack-install-progress:${installId}`,
      (event) => {
        if (maybeCallback) maybeCallback(event.payload);
      }
    );
  },

  // Native File Picker Dialog
  pickLocalFile: async (options?: {
    title?: string;
    filterName?: string;
    extensions?: string[];
    directory?: boolean;
  }): Promise<string | null> => {
    return invoke("pick_local_file", {
      title: options?.title || null,
      filterName: options?.filterName || null,
      extensions: options?.extensions || null,
      directory: options?.directory || false,
    });
  },

  // Local Mod / Plugin Upload & Drag-and-Drop
  installLocalExtension: async (
    serverId: string,
    fileName: string,
    fileBytes: number[] | Uint8Array
  ): Promise<ExtensionItem> => {
    const bytesArray = Array.from(fileBytes);
    return invoke("install_local_extension", {
      serverId,
      fileName,
      fileBytes: bytesArray,
    });
  },

  // Player Management
  getServerPlayerData: async (serverId: string): Promise<ServerPlayerData> => {
    return invoke("get_server_player_data", { serverId });
  },

  toggleServerWhitelist: async (serverId: string, enabled: boolean): Promise<boolean> => {
    return invoke("toggle_server_whitelist", { serverId, enabled });
  },

  addServerWhitelist: async (serverId: string, playerName: string): Promise<boolean> => {
    return invoke("add_server_whitelist", { serverId, playerName });
  },

  removeServerWhitelist: async (serverId: string, playerName: string): Promise<boolean> => {
    return invoke("remove_server_whitelist", { serverId, playerName });
  },

  addServerOp: async (serverId: string, playerName: string, level?: number): Promise<boolean> => {
    return invoke("add_server_op", { serverId, playerName, level: level ?? null });
  },

  removeServerOp: async (serverId: string, playerName: string): Promise<boolean> => {
    return invoke("remove_server_op", { serverId, playerName });
  },

  banServerPlayer: async (serverId: string, playerName: string, reason?: string): Promise<boolean> => {
    return invoke("ban_server_player", { serverId, playerName, reason: reason ?? null });
  },

  unbanServerPlayer: async (serverId: string, playerName: string): Promise<boolean> => {
    return invoke("unban_server_player", { serverId, playerName });
  },

  kickServerPlayer: async (serverId: string, playerName: string, reason?: string): Promise<boolean> => {
    return invoke("kick_server_player", { serverId, playerName, reason: reason ?? null });
  },

  // World & Dimension Management
  getWorldInfo: async (serverId: string): Promise<WorldDetails> => {
    return invoke("get_world_info", { serverId });
  },

  resetDimension: async (serverId: string, dimension: "nether" | "end" | "all" | "world"): Promise<boolean> => {
    return invoke("reset_dimension", { serverId, dimension });
  },

  importWorldArchive: async (
    serverId: string,
    sourceZipPath: string,
    customWorldName?: string
  ): Promise<string> => {
    return invoke("import_world_archive", {
      serverId,
      sourceZipPath,
      customWorldName: customWorldName || null,
    });
  },

  // In-App File Explorer
  listServerDir: async (serverId: string, relativeDir?: string): Promise<FileEntry[]> => {
    return invoke("list_server_dir", {
      serverId,
      relativeDir: relativeDir || null,
    });
  },

  readTextFile: async (serverId: string, relativePath: string): Promise<string> => {
    return invoke("read_text_file", { serverId, relativePath });
  },

  saveTextFile: async (serverId: string, relativePath: string, content: string): Promise<boolean> => {
    return invoke("save_text_file", { serverId, relativePath, content });
  },

  deleteServerPath: async (serverId: string, relativePath: string): Promise<boolean> => {
    return invoke("delete_server_path", { serverId, relativePath });
  },

  createServerFolder: async (serverId: string, relativePath: string): Promise<boolean> => {
    return invoke("create_server_folder", { serverId, relativePath });
  },

  confirmAppShutdown: async (): Promise<boolean> => {
    return invoke("confirm_app_shutdown");
  },
};


