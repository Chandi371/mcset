import "@testing-library/jest-dom";

// Mock Tauri API for frontend tests running in jsdom
// @ts-expect-error Mock window tauri
window.__TAURI_INTERNALS__ = {
  invoke: async (cmd: string) => {
    switch (cmd) {
      case "list_servers":
        return [];
      case "detect_java_runtimes":
        return [];
      case "get_server_config":
        return [];
      case "list_extensions":
        return [];
      case "list_backups":
        return [];
      case "list_operations":
        return [];
      case "get_ai_config":
        return {
          provider: "openai",
          api_key: "",
          model: "gpt-4o-mini",
          base_url: "",
        };
      case "read_raw_config":
        return "# Minecraft server properties\n";
      case "get_minecraft_versions":
        return {
          latest: { release: "26.3", snapshot: "26.4-snapshot-4" },
          versions: [
            {
              id: "26.3",
              type: "release",
              url: "https://piston-meta.mojang.com/26.3.json",
              time: "2026-10-13",
              releaseTime: "2026-09-15",
              sha1: "11f1aefe473eefba0af62e3286c33b692807b2eb",
            },
            {
              id: "1.21.4",
              type: "release",
              url: "https://piston-meta.mojang.com/1.21.4.json",
              time: "2024-12-03",
              releaseTime: "2024-12-03",
              sha1: "abcdef",
            },
          ],
          cached_at: 1700000000,
          is_stale: false,
        };
      case "resolve_provider_build":
        return {
          provider: "paper",
          minecraft_version: "26.3",
          build_id: "build-200",
          download_url: "https://fill-data.papermc.io/paper-26.3-200.jar",
          filename: "paper-26.3-200.jar",
          file_size: 55156784,
          checksum_type: "sha256",
          checksum_value: "0e104a19ad818f05266a4571c0a9b0cada241c2016ee64883e5d38435332fa8d",
          is_installer: false,
          target_jar: "paper.jar",
        };
      case "get_portal_status":
        return {
          server_id: "test-server-1",
          status: { state: "stopped" },
          local_port: 25565,
          public_address: null,
          relay_url: null,
          is_running: false,
          is_verified: false,
          last_verified_at: null,
          last_error: null,
        };
      case "get_portal_logs":
        return [];
      case "search_modpacks":
        return {
          hits: [],
          total_hits: 0,
          offset: 0,
          limit: 20,
          provider: "modrinth",
        };
      case "get_modpack_versions":
        return [];
      default:
        return null;
    }
  },
  transformCallback: () => 0,
};
