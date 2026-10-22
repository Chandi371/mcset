import React, { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Server, AlertTriangle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ServerList } from "./components/ServerList";
import { ConsoleView } from "./components/ConsoleView";
import { ConfigEditor } from "./components/ConfigEditor";
import { ExtensionManagerView } from "./components/ExtensionManagerView";
import { BackupManagerView } from "./components/BackupManagerView";
import { PlayerManagerView } from "./components/PlayerManagerView";
import { WorldManagerView } from "./components/WorldManagerView";
import { FileManagerView } from "./components/FileManagerView";
import { TunnelView } from "./components/TunnelView";
import { AiAssistantView } from "./components/AiAssistantView";
import { SettingsView } from "./components/SettingsView";
import { CreateServerModal } from "./components/CreateServerModal";
import { ServerProfile, ServerStatus } from "./types";
import { api } from "./lib/api";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<string>("servers");
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServer, setActiveServer] = useState<ServerProfile | null>(null);
  const activeServerRef = useRef<ServerProfile | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [isStartingOrStopping, setIsStartingOrStopping] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isAiActive, setIsAiActive] = useState(false);

  interface ShutdownRequestData {
    running_servers: string[];
    running_server_ids: string[];
    running_tunnels: string[];
    count: number;
  }
  const [shutdownData, setShutdownData] = useState<ShutdownRequestData | null>(null);
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  const handleSetActiveServer = (server: ServerProfile | null) => {
    activeServerRef.current = server;
    setActiveServer(server);
    if (server) {
      try {
        localStorage.setItem("mcset_active_server_id", server.id);
      } catch {}
      setGlobalError(null);
    } else {
      try {
        localStorage.removeItem("mcset_active_server_id");
      } catch {}
    }
  };

  const loadServers = async (selectId?: string) => {
    try {
      const list = await api.listServers();
      setServers(list);

      const savedId = (() => {
        try {
          return localStorage.getItem("mcset_active_server_id");
        } catch {
          return null;
        }
      })();

      const targetId = selectId || activeServerRef.current?.id || savedId;
      if (targetId) {
        const found = list.find((s) => s.id === targetId);
        if (found) {
          activeServerRef.current = found;
          setActiveServer(found);
          return;
        }
      }

      if (list.length > 0) {
        activeServerRef.current = list[0];
        setActiveServer(list[0]);
        try {
          localStorage.setItem("mcset_active_server_id", list[0].id);
        } catch {}
      } else {
        activeServerRef.current = null;
        setActiveServer(null);
        try {
          localStorage.removeItem("mcset_active_server_id");
        } catch {}
      }
    } catch (err) {
      console.error("Failed to load servers", err);
    }
  };

  useEffect(() => {
    loadServers();

    // Real-time listener for servers created, deleted, or updated by AI or backend operations
    let unlisten: (() => void) | undefined;
    listen("servers-changed", () => {
      loadServers();
    }).then((fn) => {
      unlisten = fn;
    });

    // Listener for window close with running servers
    let unlistenShutdown: (() => void) | undefined;
    listen<ShutdownRequestData>("app-close-requested", (e) => {
      setShutdownData(e.payload);
    }).then((fn) => {
      unlistenShutdown = fn;
    });

    // Also poll every 3 seconds for guaranteed live sync across all tabs
    const interval = setInterval(() => {
      loadServers();
    }, 3000);

    return () => {
      if (unlisten) unlisten();
      if (unlistenShutdown) unlistenShutdown();
      clearInterval(interval);
    };
  }, []);

  // Poll status of active server
  useEffect(() => {
    if (!activeServer) {
      setServerStatus(null);
      return;
    }

    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const st = await api.getServerStatus(activeServer.id);
        if (isMounted) setServerStatus(st);
      } catch (err) {
        // Ignored in poll
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeServer?.id]);

  const handleStartServer = async (targetId?: string) => {
    const id = targetId || activeServer?.id;
    if (!id) return;
    setIsStartingOrStopping(true);
    setGlobalError(null);
    try {
      await api.startServer(id);
      if (activeServer?.id === id) {
        setServerStatus({
          state: "starting",
          port: activeServer.port,
        });
      }
    } catch (err) {
      setGlobalError(`Start failed: ${String(err)}`);
    } finally {
      setIsStartingOrStopping(false);
    }
  };

  const handleStopServer = async (targetId?: string) => {
    const id = targetId || activeServer?.id;
    if (!id) return;
    setIsStartingOrStopping(true);
    setGlobalError(null);
    try {
      await api.stopServer(id);
      if (activeServer?.id === id) {
        setServerStatus({
          state: "stopping",
          port: activeServer.port,
        });
      }
    } catch (err) {
      setGlobalError(`Stop failed: ${String(err)}`);
    } finally {
      setIsStartingOrStopping(false);
    }
  };

  const handleRestartServer = async () => {
    if (!activeServer) return;
    setIsStartingOrStopping(true);
    setGlobalError(null);
    try {
      await api.restartServer(activeServer.id);
    } catch (err) {
      setGlobalError(`Restart failed: ${String(err)}`);
    } finally {
      setIsStartingOrStopping(false);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        servers={servers}
        activeServer={activeServer}
        setActiveServer={handleSetActiveServer}
        serverStatus={serverStatus}
        onOpenCreateModal={() => setCreateModalOpen(true)}
        onStartServer={() => handleStartServer()}
        onStopServer={() => handleStopServer()}
        isStartingOrStopping={isStartingOrStopping}
        isAiActive={isAiActive}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {globalError && (
          <div className="bg-rose-500/20 border-b border-rose-500/30 text-rose-300 text-xs px-6 py-2.5 flex items-center justify-between">
            <span>{globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="text-rose-400 hover:text-rose-200 font-bold ml-4"
            >
              &times;
            </button>
          </div>
        )}

        {currentTab === "servers" && (
          <ServerList
            servers={servers}
            activeServer={activeServer}
            onSelectServer={(s) => {
              handleSetActiveServer(s);
              setCurrentTab("console");
            }}
            onOpenCreateModal={() => setCreateModalOpen(true)}
            onServerDeleted={(id) => {
              if (activeServerRef.current?.id === id) handleSetActiveServer(null);
              loadServers();
            }}
            activeStatus={serverStatus}
            onStartServer={(id) => handleStartServer(id)}
            onStopServer={(id) => handleStopServer(id)}
          />
        )}

        {currentTab === "console" && activeServer && (
          <ConsoleView
            server={activeServer}
            status={serverStatus}
            onStart={() => handleStartServer()}
            onStop={() => handleStopServer()}
            onRestart={handleRestartServer}
          />
        )}

        {currentTab === "players" && activeServer && (
          <PlayerManagerView
            server={activeServer}
            serverStatus={serverStatus}
          />
        )}

        {currentTab === "worlds" && activeServer && (
          <WorldManagerView
            server={activeServer}
            serverStatus={serverStatus}
          />
        )}

        {currentTab === "files" && activeServer && (
          <FileManagerView
            server={activeServer}
          />
        )}

        {currentTab === "tunnel" && activeServer && (
          <TunnelView
            server={activeServer}
            serverStatus={serverStatus}
          />
        )}

        {currentTab === "config" && activeServer && (
          <ConfigEditor server={activeServer} />
        )}

        {currentTab === "extensions" && activeServer && (
          <ExtensionManagerView server={activeServer} />
        )}

        {currentTab === "backups" && activeServer && (
          <BackupManagerView server={activeServer} />
        )}

        {/* Friendly placeholder when user visits a server view without a server selected */}
        {["console", "players", "worlds", "files", "tunnel", "config", "extensions", "backups"].includes(currentTab) && !activeServer && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-card/20 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground border border-border">
              <Server className="w-7 h-7" />
            </div>
            <div className="max-w-md space-y-1.5">
              <h3 className="text-sm font-bold text-foreground">No Server Selected</h3>
              <p className="text-xs text-muted-foreground">
                To access {currentTab === "console" ? "live logs and commands" : currentTab === "tunnel" ? "Portal public tunnels" : currentTab === "config" ? "configuration settings" : currentTab === "extensions" ? "mods and plugins" : "backups"}, please select an active server from the sidebar or create a new one.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setCurrentTab("servers")}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold rounded-lg transition-colors"
              >
                Go to Servers
              </button>
              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-background text-xs font-bold rounded-lg shadow-sm transition-colors"
              >
                Create Server
              </button>
            </div>
          </div>
        )}

        {/* Persistent background AI Assistant view: never unmounted so tab switches never kill in-flight AI tools */}
        <div className={currentTab === "ai" ? "h-full flex flex-col flex-1 overflow-hidden" : "hidden"}>
          <AiAssistantView
            activeServer={activeServer}
            onNavigateToSettings={() => setCurrentTab("settings")}
            onAiActiveChange={setIsAiActive}
            onServersChanged={loadServers}
          />
        </div>

        {currentTab === "settings" && <SettingsView />}
      </main>

      {createModalOpen && (
        <CreateServerModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onServerCreated={(newServer) => {
            loadServers(newServer.id);
            setCurrentTab("console");
          }}
        />
      )}
      {/* Active Server / Tunnel Shutdown Confirmation Modal */}
      {shutdownData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-base">Active Servers Running</h3>
                <p className="text-xs text-muted-foreground">Confirm Application Exit</p>
              </div>
            </div>

            <p className="text-sm text-foreground/90 leading-relaxed">
              You have <strong className="text-amber-400">{shutdownData.count}</strong> active Minecraft server(s) or tunnel(s) currently running:
            </p>

            <div className="bg-background/80 border border-border/60 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 text-xs">
              {shutdownData.running_servers.map((name, idx) => (
                <div key={idx} className="flex items-center gap-2 text-foreground font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="truncate">{name}</span>
                </div>
              ))}
              {shutdownData.running_tunnels.map((tId, idx) => (
                <div key={`t-${idx}`} className="flex items-center gap-2 text-muted-foreground font-mono">
                  <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                  <span className="truncate">Portal Tunnel: {tId}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-rose-400/90 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2.5">
              ⚠️ Closing MCSet now will stop active server processes and disconnect online players.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShutdownData(null)}
                disabled={isShuttingDown}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsShuttingDown(true);
                    await api.confirmAppShutdown();
                  } catch (e) {
                    console.error("Failed to shutdown servers", e);
                    setIsShuttingDown(false);
                    setShutdownData(null);
                  }
                }}
                disabled={isShuttingDown}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isShuttingDown ? "Stopping Servers & Exiting..." : "Stop Servers & Exit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default App;

