import React, { useState, useRef, useEffect } from "react";
import {
  Server,
  Terminal,
  Sliders,
  Package,
  HardDrive,
  Bot,
  Settings,
  PlusCircle,
  Play,
  Square,
  Activity,
  FolderOpen,
  Globe,
  Users,
  Compass,
  FolderTree,
  ChevronDown,
  Check,
  Search,
} from "lucide-react";
import { ServerProfile, ServerStatus } from "../types";
import { api } from "../lib/api";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  servers: ServerProfile[];
  activeServer: ServerProfile | null;
  setActiveServer: (server: ServerProfile | null) => void;
  serverStatus: ServerStatus | null;
  onOpenCreateModal: () => void;
  onStartServer: () => void;
  onStopServer: () => void;
  isStartingOrStopping: boolean;
  isAiActive?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  servers,
  activeServer,
  setActiveServer,
  serverStatus,
  onOpenCreateModal,
  onStartServer,
  onStopServer,
  isStartingOrStopping,
  isAiActive = false,
}) => {
  const isRunning = serverStatus?.state === "running";
  const isStarting = serverStatus?.state === "starting";
  const isStopping = serverStatus?.state === "stopping";
  const isCrashed = serverStatus?.state === "crashed";

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  const getServerBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("paper")) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    if (t.includes("purpur")) return "bg-purple-500/15 text-purple-400 border-purple-500/30";
    if (t.includes("fabric")) return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    if (t.includes("forge")) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    if (t.includes("modpack") || t.includes("modrinth") || t.includes("curseforge"))
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    return "bg-zinc-500/15 text-zinc-300 border-zinc-500/30";
  };

  const filteredServers = servers.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.server_type.toLowerCase().includes(q) ||
      s.minecraft_version.toLowerCase().includes(q)
    );
  });

  const navItems = [
    { id: "servers", label: "Servers", icon: Server },
    { id: "console", label: "Console & Logs", icon: Terminal, requiresServer: true },
    { id: "players", label: "Players", icon: Users, requiresServer: true },
    { id: "worlds", label: "Worlds & Dimensions", icon: Compass, requiresServer: true },
    { id: "files", label: "File Explorer", icon: FolderTree, requiresServer: true },
    { id: "tunnel", label: "Public Tunnel", icon: Globe, requiresServer: true },
    { id: "config", label: "Configuration", icon: Sliders, requiresServer: true },
    { id: "extensions", label: "Mods & Plugins", icon: Package, requiresServer: true },
    { id: "backups", label: "Backups", icon: HardDrive, requiresServer: true },
    { id: "ai", label: "AI Technician", icon: Bot },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shadow-lg shadow-emerald-500/10">
            MC
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5">
              MCSet
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                v0.1
              </span>
            </h1>
            <p className="text-[11px] text-muted-foreground">Server Management</p>
          </div>
        </div>
      </div>

      {/* Active Server Selector */}
      <div className="p-3 border-b border-border bg-secondary/30 relative z-30">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Active Server
          </span>
          <button
            onClick={onOpenCreateModal}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
          >
            <PlusCircle className="w-3 h-3" /> New
          </button>
        </div>

        {servers.length === 0 ? (
          <button
            onClick={onOpenCreateModal}
            className="w-full text-left py-2 px-2.5 rounded-md border border-dashed border-border hover:border-emerald-500/50 hover:bg-emerald-500/5 text-xs text-muted-foreground transition-all flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Create your first server</span>
          </button>
        ) : (
          <div ref={dropdownRef} className="relative">
            {/* Custom Trigger Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDropdownOpen((prev) => !prev);
              }}
              className={`w-full bg-secondary/70 hover:bg-secondary border text-foreground text-xs rounded-lg px-2.5 py-2 focus:outline-none transition-all flex items-center justify-between gap-2 shadow-sm text-left group ${
                isDropdownOpen
                  ? "border-emerald-500/60 ring-1 ring-emerald-500/30"
                  : "border-border hover:border-emerald-500/40"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isRunning
                      ? "bg-emerald-400 shadow-sm shadow-emerald-500/50 animate-pulse"
                      : isStarting
                      ? "bg-amber-400 animate-spin"
                      : isStopping
                      ? "bg-orange-400"
                      : isCrashed
                      ? "bg-rose-500"
                      : "bg-muted-foreground/40"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-xs text-foreground truncate leading-tight">
                    {activeServer?.name || "Select a server"}
                  </div>
                  {activeServer && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium border uppercase tracking-wider ${getServerBadge(
                          activeServer.server_type
                        )}`}
                      >
                        {activeServer.server_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {activeServer.minecraft_version}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-transform duration-200 shrink-0 ${
                  isDropdownOpen ? "rotate-180 text-emerald-400" : ""
                }`}
              />
            </button>

            {/* Custom Popover Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-popover/95 backdrop-blur-md border border-border rounded-xl shadow-2xl p-1.5 flex flex-col gap-1 max-h-80 overflow-hidden">
                {servers.length > 3 && (
                  <div className="px-2 py-1.5 border-b border-border/60 mb-1 flex items-center gap-2 bg-secondary/40 rounded-lg">
                    <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      placeholder="Search servers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                      autoFocus
                    />
                  </div>
                )}

                <div className="overflow-y-auto max-h-52 space-y-1 pr-0.5">
                  {filteredServers.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No matching servers
                    </div>
                  ) : (
                    filteredServers.map((s) => {
                      const isSelected = activeServer?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveServer(s);
                            setIsDropdownOpen(false);
                            setSearchQuery("");
                          }}
                          className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between gap-2 text-xs ${
                            isSelected
                              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium"
                              : "hover:bg-secondary/70 border border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground truncate">
                                {s.name}
                              </span>
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-mono border uppercase ${getServerBadge(
                                  s.server_type
                                )}`}
                              >
                                {s.server_type}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              MC {s.minecraft_version} • Port {s.port}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="border-t border-border/60 pt-1.5 mt-0.5 flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDropdownOpen(false);
                      onOpenCreateModal();
                    }}
                    className="w-full py-1.5 px-2 rounded-lg hover:bg-emerald-500/10 text-emerald-400 text-xs font-medium flex items-center gap-2 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Create New Server</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDropdownOpen(false);
                      setCurrentTab("servers");
                    }}
                    className="w-full py-1.5 px-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground text-xs flex items-center gap-2 transition-colors"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>Manage All Servers</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick Lifecycle Controls if an active server is selected */}
        {activeServer && (
          <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-border/50">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isRunning
                    ? "bg-emerald-400 animate-pulse"
                    : isStarting
                    ? "bg-amber-400 animate-spin"
                    : isStopping
                    ? "bg-orange-400 animate-pulse"
                    : isCrashed
                    ? "bg-rose-500"
                    : "bg-muted-foreground/40"
                }`}
              />
              <span className="text-[11px] font-medium truncate capitalize">
                {isStarting
                  ? "Starting..."
                  : isStopping
                  ? "Stopping..."
                  : isRunning
                  ? `Port :${activeServer.port}`
                  : isCrashed
                  ? "Crashed"
                  : "Stopped"}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={async () => {
                  try {
                    await api.openServerDirectory(activeServer.id);
                  } catch (err) {
                    alert(`Failed to open folder: ${String(err)}`);
                  }
                }}
                className="p-1 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors"
                title="Open Server Directory in File Explorer"
              >
                <FolderOpen className="w-3 h-3" />
              </button>

              {isRunning || isStarting ? (
                <button
                  onClick={onStopServer}
                  disabled={isStartingOrStopping || isStopping}
                  className="px-2 py-1 text-[11px] font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Square className="w-2.5 h-2.5 fill-rose-300" /> Stop
                </button>
              ) : (
                <button
                  onClick={onStartServer}
                  disabled={isStartingOrStopping}
                  className="px-2 py-1 text-[11px] font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Play className="w-2.5 h-2.5 fill-emerald-300" /> Start
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : ""}`} />
                <span>{item.label}</span>
              </div>
              {item.requiresServer && !activeServer && (
                <span className="text-[9px] text-muted-foreground/60 uppercase font-mono">
                  No Server
                </span>
              )}
              {item.id === "ai" && isAiActive && (
                <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-normal">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Working
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info / Safety status */}
      <div className="p-3 border-t border-border bg-secondary/20 text-[11px] text-muted-foreground space-y-1">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-emerald-400" />
            Sandbox Protected
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">MCP Ready</span>
        </div>
      </div>
    </aside>
  );
};
