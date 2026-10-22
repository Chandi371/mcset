import React, { useState, useEffect } from "react";
import {
  FolderTree,
  Folder,
  FileText,
  FileCode,
  File,
  FolderOpen,
  Trash2,
  Edit3,
  Plus,
  RefreshCw,
  ChevronRight,
  ArrowLeft,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Code2,
} from "lucide-react";
import { ServerProfile, FileEntry } from "../types";
import { api } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

interface FileManagerViewProps {
  server: ServerProfile;
}

export const FileManagerView: React.FC<FileManagerViewProps> = ({ server }) => {
  const [currentDir, setCurrentDir] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // File Editor Modal
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  // editorLoading removed
  const [savingFile, setSavingFile] = useState(false);

  // New Folder / File Prompt Modal
  const [newItemModal, setNewItemModal] = useState<{ isOpen: boolean; type: "file" | "folder"; name: string }>({
    isOpen: false,
    type: "folder",
    name: "",
  });

  // Confirm delete
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const loadDirectory = async (dir = currentDir) => {
    setLoading(true);
    setError(null);
    try {
      const items = await api.listServerDir(server.id, dir);
      setEntries(items);
      setCurrentDir(dir);
    } catch (err) {
      setError(`Failed to read folder: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDirectory("");
  }, [server.id]);

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleOpenFolder = (relPath: string) => {
    loadDirectory(relPath);
  };

  const handleNavigateUp = () => {
    if (!currentDir) return;
    const parts = currentDir.split("/").filter(Boolean);
    parts.pop();
    loadDirectory(parts.join("/"));
  };

  const handleBreadcrumbClick = (index: number) => {
    const parts = currentDir.split("/").filter(Boolean);
    const newPath = parts.slice(0, index + 1).join("/");
    loadDirectory(newPath);
  };

  const handleOpenFile = async (relPath: string) => {
    
    setError(null);
    try {
      const content = await api.readTextFile(server.id, relPath);
      setEditingFile({ path: relPath, content });
    } catch (err) {
      setError(`Cannot edit file: ${String(err)}`);
    } finally {
      
    }
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setSavingFile(true);
    try {
      await api.saveTextFile(server.id, editingFile.path, editingFile.content);
      notifySuccess(`Saved ${editingFile.path.split("/").pop()}`);
      setEditingFile(null);
      loadDirectory();
    } catch (err) {
      setError(`Failed to save file: ${String(err)}`);
    } finally {
      setSavingFile(false);
    }
  };

  const handleDeleteEntry = (relPath: string, isDir: boolean) => {
    const name = relPath.split("/").pop() || relPath;
    setConfirmModal({
      isOpen: true,
      title: `Delete ${isDir ? "Folder" : "File"}?`,
      message: `Are you sure you want to permanently delete '${name}'? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          await api.deleteServerPath(server.id, relPath);
          notifySuccess(`Deleted '${name}'`);
          loadDirectory();
        } catch (err) {
          setError(`Delete failed: ${String(err)}`);
        }
      },
    });
  };

  const handleCreateNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newItemModal.name.trim();
    if (!name) return;

    const fullRelPath = currentDir ? `${currentDir}/${name}` : name;
    try {
      if (newItemModal.type === "folder") {
        await api.createServerFolder(server.id, fullRelPath);
        notifySuccess(`Created folder '${name}'`);
      } else {
        await api.saveTextFile(server.id, fullRelPath, "");
        notifySuccess(`Created file '${name}'`);
      }
      setNewItemModal({ isOpen: false, type: "folder", name: "" });
      loadDirectory();
    } catch (err) {
      setError(`Failed to create ${newItemModal.type}: ${String(err)}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ms: number): string => {
    if (!ms) return "-";
    const d = new Date(ms);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const isEditable = (ext?: string | null): boolean => {
    if (!ext) return false;
    const editable = ["txt", "json", "yml", "yaml", "toml", "properties", "cfg", "conf", "log", "md", "sh", "bat"];
    return editable.includes(ext.toLowerCase());
  };

  const getFileIcon = (entry: FileEntry) => {
    if (entry.is_dir) return <Folder className="w-4 h-4 text-amber-400 shrink-0" />;
    const ext = entry.extension?.toLowerCase();
    if (ext === "json" || ext === "yml" || ext === "yaml" || ext === "toml" || ext === "properties") {
      return <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />;
    }
    if (ext === "log") return <FileText className="w-4 h-4 text-sky-400 shrink-0" />;
    if (ext === "jar") return <Code2 className="w-4 h-4 text-purple-400 shrink-0" />;
    return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  const breadcrumbs = currentDir ? currentDir.split("/").filter(Boolean) : [];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <FolderTree className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Server File Explorer</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Browse, view, edit configuration scripts, and manage files for{" "}
              <span className="text-emerald-400 font-semibold">{server.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setNewItemModal({ isOpen: true, type: "folder", name: "" })}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" /> New Folder
          </button>
          <button
            onClick={() => setNewItemModal({ isOpen: true, type: "file", name: "" })}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" /> New File
          </button>
          <button
            onClick={() => api.openServerDirectory(server.id)}
            className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
            title="Open in Windows File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> Native Explorer
          </button>
          <button
            onClick={() => loadDirectory()}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary/80 hover:bg-secondary rounded-lg border border-border text-xs flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 font-bold">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border px-3.5 py-2 rounded-xl">
        {currentDir && (
          <button
            onClick={handleNavigateUp}
            className="p-1 hover:bg-secondary text-foreground rounded transition-colors mr-1"
            title="Go up one folder"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => loadDirectory("")}
          className={`hover:text-emerald-400 font-medium ${!currentDir ? "text-emerald-400 font-bold" : ""}`}
        >
          server_root
        </button>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight className="w-3 h-3 text-muted-foreground/60" />
            <button
              onClick={() => handleBreadcrumbClick(idx)}
              className={`hover:text-emerald-400 font-medium ${
                idx === breadcrumbs.length - 1 ? "text-emerald-400 font-bold" : ""
              }`}
            >
              {crumb}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* File Table */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col shadow-sm">
        <div className="grid grid-cols-12 gap-4 px-4 py-2.5 border-b border-border bg-secondary/30 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
          <div className="col-span-6">Name</div>
          <div className="col-span-2 text-right">Size</div>
          <div className="col-span-3">Last Modified</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              {loading ? "Loading folder contents..." : "This folder is empty."}
            </div>
          ) : (
            entries.map((entry) => {
              const editable = isEditable(entry.extension);
              return (
                <div
                  key={entry.name}
                  className="grid grid-cols-12 gap-4 px-4 py-2 text-xs items-center hover:bg-secondary/40 transition-colors group"
                >
                  <div
                    className="col-span-6 flex items-center gap-2.5 cursor-pointer min-w-0"
                    onClick={() => {
                      if (entry.is_dir) {
                        handleOpenFolder(entry.relative_path);
                      } else if (editable) {
                        handleOpenFile(entry.relative_path);
                      }
                    }}
                  >
                    {getFileIcon(entry)}
                    <span
                      className={`truncate font-medium ${
                        entry.is_dir
                          ? "text-foreground font-semibold hover:text-emerald-400"
                          : editable
                          ? "text-foreground hover:text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.name}
                    </span>
                  </div>

                  <div className="col-span-2 text-right text-muted-foreground font-mono text-[11px]">
                    {entry.is_dir ? "-" : formatFileSize(entry.size_bytes)}
                  </div>

                  <div className="col-span-3 text-muted-foreground text-[11px]">
                    {formatDate(entry.modified_ms)}
                  </div>

                  <div className="col-span-1 flex items-center justify-end gap-1">
                    {!entry.is_dir && editable && (
                      <button
                        onClick={() => handleOpenFile(entry.relative_path)}
                        className="p-1 hover:bg-secondary text-muted-foreground hover:text-emerald-400 rounded transition-colors"
                        title="Edit file"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteEntry(entry.relative_path, entry.is_dir)}
                      className="p-1 hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* IN-APP TEXT EDITOR MODAL */}
      {editingFile && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in">
          <div className="w-full max-w-4xl h-[85vh] bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-foreground font-mono">
                  {editingFile.path}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveFile}
                  disabled={savingFile}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-background text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingFile ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div className="flex-1 p-3 bg-secondary/10 overflow-hidden flex flex-col">
              <textarea
                value={editingFile.content}
                onChange={(e) => setEditingFile({ ...editingFile, content: e.target.value })}
                className="w-full h-full bg-background/90 border border-border/80 rounded-xl p-4 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW FOLDER/FILE MODAL */}
      {newItemModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 space-y-4 shadow-xl">
            <h3 className="text-sm font-bold text-foreground">
              Create New {newItemModal.type === "folder" ? "Folder" : "File"}
            </h3>
            <form onSubmit={handleCreateNewItem} className="space-y-3">
              <input
                type="text"
                autoFocus
                placeholder={newItemModal.type === "folder" ? "e.g. datapacks" : "e.g. motd.txt or rules.json"}
                value={newItemModal.name}
                onChange={(e) => setNewItemModal({ ...newItemModal, name: e.target.value })}
                className="w-full bg-secondary/70 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewItemModal({ ...newItemModal, isOpen: false })}
                  className="px-3 py-1.5 bg-secondary text-foreground text-xs rounded-lg border border-border hover:bg-secondary/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newItemModal.name.trim()}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-background text-xs font-bold rounded-lg transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText="Delete"
        variant="danger"
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
