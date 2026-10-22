import React, { useState } from "react";
import {
  Server,
  Play,
  Square,
  Trash2,
  PlusCircle,
  Search,
  FolderOpen,
  Share2,
  Layers,
} from "lucide-react";
import { ServerProfile, ServerStatus } from "../types";
import { api } from "../lib/api";
import { ShareServerModal } from "./ShareServerModal";

interface ServerListProps {
  servers: ServerProfile[];
  activeServer: ServerProfile | null;
  onSelectServer: (server: ServerProfile) => void;
  onOpenCreateModal: () => void;
  onServerDeleted: (serverId: string) => void;
  activeStatus: ServerStatus | null;
  onStartServer: (serverId: string) => void;
  onStopServer: (serverId: string) => void;
}

export const ServerList: React.FC<ServerListProps> = ({
  servers,
  activeServer,
  onSelectServer,
  onOpenCreateModal,
  onServerDeleted,
  activeStatus,
  onStartServer,
  onStopServer,
}) => {
  const [search, setSearch] = useState("");
  const [deleteModalServer, setDeleteModalServer] = useState<ServerProfile | null>(null);
  const [shareModalServer, setShareModalServer] = useState<ServerProfile | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.server_type.toLowerCase().includes(search.toLowerCase()) ||
    s.minecraft_version.includes(search)
  );

  const handleDeleteConfirm = async () => {
    if (!deleteModalServer) return;
    setDeleting(true);
    try {
      await api.deleteServer(deleteModalServer.id, deleteFiles);
      onServerDeleted(deleteModalServer.id);
      setDeleteModalServer(null);
    } catch (err) {
      alert(`Failed to delete server: ${String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground">Minecraft Servers</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your local Minecraft servers, view live status, and configure environments
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter servers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 bg-secondary/70 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" /> Create Server
          </button>
        </div>
      </div>

      {/* Grid of Servers */}
      <div className="flex-1 overflow-y-auto">
        {servers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10 mb-3">
                <Server className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Welcome to MCSet</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                MCSet gives you total local control over Minecraft Java servers. Choose an option below to get started or configure settings.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full">
              <div
                onClick={onOpenCreateModal}
                className="p-4 bg-card hover:bg-card/80 border border-border hover:border-emerald-500/40 rounded-xl cursor-pointer transition-all space-y-2 group"
              >
                <div className="p-2 w-fit rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                  <Server className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Vanilla &amp; Custom</h4>
                <p className="text-[11px] text-muted-foreground">
                  Deploy Paper, Purpur, Fabric, Forge, or import an existing ZIP.
                </p>
              </div>

              <div
                onClick={onOpenCreateModal}
                className="p-4 bg-card hover:bg-card/80 border border-border hover:border-emerald-500/40 rounded-xl cursor-pointer transition-all space-y-2 group"
              >
                <div className="p-2 w-fit rounded-lg bg-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                  <Layers className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-foreground">Modpack Installer</h4>
                <p className="text-[11px] text-muted-foreground">
                  1-Click automated installation from Modrinth &amp; CurseForge.
                </p>
              </div>
            </div>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            No servers match "{search}".
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServers.map((server) => {
              const isActive = activeServer?.id === server.id;
              const isRunning = isActive && activeStatus?.state === "running";
              const isStarting = isActive && activeStatus?.state === "starting";
              const isCrashed = isActive && activeStatus?.state === "crashed";

              return (
                <div
                  key={server.id}
                  onClick={() => onSelectServer(server)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? "bg-card border-emerald-500/60 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/50"
                      : "bg-card border-border hover:border-border/80 hover:bg-card/80"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                            isActive
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {server.server_type.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-foreground leading-tight">
                            {server.name}
                          </h4>
                          <span className="text-[11px] text-muted-foreground font-mono">
                            Port {server.port}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium capitalize flex items-center gap-1.5 ${
                          isRunning
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : isStarting
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
                            : isCrashed
                            ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                            : "bg-secondary text-muted-foreground border border-border"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning
                              ? "bg-emerald-400"
                              : isStarting
                              ? "bg-amber-400"
                              : isCrashed
                              ? "bg-rose-400"
                              : "bg-muted-foreground"
                          }`}
                        />
                        {isActive ? activeStatus?.state || "Stopped" : "Idle"}
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Software:</span>
                        <span className="text-foreground font-semibold uppercase">
                          {server.server_type} {server.minecraft_version}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Allocated RAM:</span>
                        <span className="text-foreground font-mono">
                          {server.min_ram_mb / 1024}G - {server.max_ram_mb / 1024}G
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs truncate">
                        <span className="text-muted-foreground shrink-0 mr-2">Location:</span>
                        <span className="text-muted-foreground/80 font-mono text-[10px] truncate">
                          {server.server_dir}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                    <span className="text-[11px] text-emerald-400 font-medium">
                      {isActive ? "Currently Selected" : "Click to Manage"}
                    </span>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {isRunning || isStarting ? (
                        <button
                          onClick={() => onStopServer(server.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Square className="w-3 h-3 fill-rose-300" /> Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => onStartServer(server.id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Play className="w-3 h-3 fill-emerald-300" /> Start
                        </button>
                      )}

                      <button
                        onClick={async () => {
                          try {
                            await api.openServerDirectory(server.id);
                          } catch (err) {
                            alert(`Failed to open folder: ${String(err)}`);
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Open Server Directory in File Explorer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setShareModalServer(server)}
                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        title="Share with Friends / Public Access (Portal Tunnel)"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          setDeleteModalServer(server);
                          setDeleteFiles(false);
                        }}
                        className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title="Delete Server Profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2 text-rose-400">
                <Trash2 className="w-4 h-4" />
                Delete "{deleteModalServer.name}"
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to delete this server profile?
              </p>

              <div className="p-3 bg-secondary/40 border border-border rounded-lg flex items-start gap-3">
                <input
                  type="checkbox"
                  id="deleteFiles"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-rose-500"
                />
                <label
                  htmlFor="deleteFiles"
                  className="text-xs text-foreground leading-snug cursor-pointer"
                >
                  Also permanently delete all server files, worlds, and plugins on disk (
                  <code className="text-rose-400 font-mono text-[10px]">
                    {deleteModalServer.server_dir}
                  </code>
                  )
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-secondary/20">
              <button
                type="button"
                onClick={() => setDeleteModalServer(null)}
                className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-5 py-2 text-xs font-semibold bg-rose-500 hover:bg-rose-400 text-white rounded-lg shadow-md shadow-rose-500/20 transition-all disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete Server"}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareModalServer && (
        <ShareServerModal
          server={shareModalServer}
          serverStatus={shareModalServer.id === activeServer?.id ? activeStatus : null}
          isOpen={!!shareModalServer}
          onClose={() => setShareModalServer(null)}
        />
      )}
    </div>
  );
};
