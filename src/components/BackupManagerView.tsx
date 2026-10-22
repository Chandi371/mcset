import React, { useState, useEffect } from "react";
import {
  HardDrive,
  Plus,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Clock,
  FolderOpen,
} from "lucide-react";
import { BackupRecord, ServerProfile } from "../types";
import { api } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

interface BackupManagerViewProps {
  server: ServerProfile;
}

export const BackupManagerView: React.FC<BackupManagerViewProps> = ({ server }) => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [backupDescription, setBackupDescription] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // In-app confirmation dialog state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    variant: "danger" | "warning";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    variant: "danger",
    onConfirm: () => {},
  });

  const loadBackups = async () => {
    setLoading(true);
    try {
      const list = await api.listBackups(server.id);
      setBackups(list);
    } catch (err) {
      setNotification({ type: "error", message: `Failed to load backups: ${String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, [server.id]);

  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const rec = await api.createBackup(server.id, backupDescription.trim() || "Manual backup");
      setCreateModalOpen(false);
      setBackupDescription("");
      setNotification({
        type: "success",
        message: `Created backup archive ${rec.file_name} successfully!`,
      });
      setTimeout(() => setNotification(null), 4000);
      await loadBackups();
    } catch (err) {
      setNotification({ type: "error", message: `Failed to create backup: ${String(err)}` });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestore = (backup: BackupRecord) => {
    setConfirmModal({
      isOpen: true,
      title: "Restore Server Backup",
      message: `Are you sure you want to restore "${backup.file_name}"? Any changes made to worlds and configurations since this snapshot was taken will be overwritten.`,
      confirmText: "Restore Backup",
      variant: "warning",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        setActionLoading(true);
        try {
          await api.restoreBackup(server.id, backup.file_name);
          setNotification({
            type: "success",
            message: `Restored backup ${backup.file_name} successfully!`,
          });
          setTimeout(() => setNotification(null), 5000);
        } catch (err) {
          setNotification({ type: "error", message: `Failed to restore backup: ${String(err)}` });
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleDelete = (backup: BackupRecord) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Backup Archive",
      message: `Delete backup "${backup.file_name}" permanently? This action cannot be undone.`,
      confirmText: "Delete Permanently",
      variant: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          await api.deleteBackup(server.id, backup.id, backup.file_name);
          setNotification({
            type: "success",
            message: `Deleted backup ${backup.file_name}`,
          });
          setTimeout(() => setNotification(null), 3000);
          await loadBackups();
        } catch (err) {
          setNotification({ type: "error", message: `Failed to delete backup: ${String(err)}` });
        }
      },
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground">Backup & Recovery</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Safeguard your server world, configs, and extensions with compressed snapshots
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={async () => {
              try {
                await api.openServerDirectory(server.id);
              } catch (err) {
                setNotification({ type: "error", message: `Failed to open folder: ${String(err)}` });
              }
            }}
            className="px-3 py-2 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors flex items-center gap-1.5"
            title="Open Server Directory in File Explorer"
          >
            <FolderOpen className="w-4 h-4 text-emerald-400" /> Open Folder
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Create Snapshot
          </button>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Backups List */}
      <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 bg-secondary/30 border-b border-border flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Archive className="w-4 h-4 text-emerald-400" />
            Existing Backups for {server.name} ({backups.length})
          </span>
          <span className="text-[11px] text-muted-foreground">
            Saved inside <code className="text-emerald-400 font-mono text-[10px]">backups/</code>
          </span>
        </div>

        <div className="flex-1 p-4 overflow-y-auto space-y-2.5">
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Loading backups...
            </div>
          ) : backups.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <HardDrive className="w-10 h-10 text-muted-foreground/30" />
              <div className="text-xs text-muted-foreground max-w-sm">
                No backup archives found. Create a snapshot before installing heavy mods or updating
                configurations!
              </div>
            </div>
          ) : (
            backups.map((b) => (
              <div
                key={b.id}
                className="p-4 bg-secondary/20 border border-border rounded-xl flex items-center justify-between gap-4 hover:border-border/80 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                    <Archive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground font-mono">
                        {b.file_name}
                      </span>
                      <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">
                        {formatFileSize(b.file_size_bytes)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {b.description || "Manual snapshot"}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 mt-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(b.created_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(b)}
                    disabled={actionLoading}
                    className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-emerald-400" /> Restore
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={actionLoading}
                    className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    title="Delete backup"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Backup Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                Create New Server Snapshot
              </h3>
            </div>

            <form onSubmit={handleCreateBackup} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Description / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Before installing EssentialsX & LuckPerms"
                  value={backupDescription}
                  onChange={(e) => setBackupDescription(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                This will create a compressed .zip archive of worlds, configs, and plugins, safely
                excluding temporary caches.
              </p>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
                >
                  {actionLoading ? "Archiving..." : "Create Snapshot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-app confirmation modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        isLoading={actionLoading}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
