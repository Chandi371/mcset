import React, { useState, useEffect } from "react";
import {
  Package,
  Search,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  FolderOpen,
  Sparkles,
  Flame,
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react";
import { ExtensionItem, ModrinthProjectHit, ServerProfile } from "../types";
import { api } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

interface ExtensionManagerViewProps {
  server: ServerProfile;
}

export const ExtensionManagerView: React.FC<ExtensionManagerViewProps> = ({ server }) => {
  const [tab, setTab] = useState<"installed" | "modrinth">("modrinth");
  const [installedItems, setInstalledItems] = useState<ExtensionItem[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState(true);

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

  // Modrinth search & pagination state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortIndex, setSortIndex] = useState<"downloads" | "follows" | "updated" | "relevance">("downloads");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [totalHits, setTotalHits] = useState(0);
  const [searchResults, setSearchResults] = useState<ModrinthProjectHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [installingProject, setInstallingProject] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const isModServer =
    server.server_type === "fabric" ||
    server.server_type === "forge" ||
    server.server_type === "neoforge";
  const extensionTypeLabel = isModServer ? "Mods" : "Plugins";

  const loadInstalled = async () => {
    setLoadingInstalled(true);
    try {
      const items = await api.listExtensions(server.id);
      setInstalledItems(items);
    } catch (err) {
      setNotification({ type: "error", message: `Failed to load extensions: ${String(err)}` });
    } finally {
      setLoadingInstalled(false);
    }
  };

  const handleInstallLocalFile = async (fileName: string, bytes: Uint8Array) => {
    setIsUploading(true);
    try {
      await api.installLocalExtension(server.id, fileName, bytes);
      setNotification({ type: "success", message: `Successfully installed ${fileName} into ${extensionTypeLabel}` });
      setTab("installed");
      loadInstalled();
    } catch (err) {
      setNotification({ type: "error", message: `Installation failed: ${String(err)}` });
    } finally {
      setIsUploading(false);
    }
  };

    const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i];
        if (file.name.endsWith(".jar") || file.name.endsWith(".jar.disabled")) {
          const buffer = await file.arrayBuffer();
          await handleInstallLocalFile(file.name, new Uint8Array(buffer));
        } else {
          setNotification({ type: "error", message: `Skipped '${file.name}': Only .jar files are supported as mods/plugins.` });
        }
      }
    }
  };

  const loadMarketplace = async (query = searchQuery, sort = sortIndex, targetPage = page) => {
    setSearching(true);
    try {
      const offset = (targetPage - 1) * pageSize;
      const res = await api.searchModrinth(server.id, query.trim(), sort, offset);
      setSearchResults(res.hits || []);
      setTotalHits(res.total_hits || 0);
      setPage(targetPage);
    } catch (err) {
      setNotification({ type: "error", message: `Modrinth browse failed: ${String(err)}` });
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadInstalled();
    loadMarketplace("", "downloads", 1);
  }, [server.id]);

  const handleToggle = async (item: ExtensionItem) => {
    try {
      await api.toggleExtension(server.id, item.file_name);
      await loadInstalled();
      setNotification({
        type: "success",
        message: `${item.name} is now ${item.enabled ? "disabled" : "enabled"}.`,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setNotification({ type: "error", message: `Error toggling extension: ${String(err)}` });
    }
  };

  const handleRemove = (item: ExtensionItem) => {
    setConfirmModal({
      isOpen: true,
      title: `Remove ${item.name}`,
      message: `Are you sure you want to permanently remove "${item.file_name}" from your ${extensionTypeLabel.toLowerCase()} folder?`,
      confirmText: "Remove File",
      variant: "danger",
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
        try {
          await api.removeExtension(server.id, item.file_name);
          await loadInstalled();
          setNotification({
            type: "success",
            message: `Removed ${item.name} successfully.`,
          });
          setTimeout(() => setNotification(null), 3000);
        } catch (err) {
          setNotification({ type: "error", message: `Error removing extension: ${String(err)}` });
        }
      },
    });
  };

  const handleSearchModrinth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    loadMarketplace(searchQuery, sortIndex, 1);
  };

  const handleInstallProject = async (project: ModrinthProjectHit) => {
    setInstallingProject(project.project_id);
    setNotification(null);
    try {
      // 1. Fetch versions compatible with this server
      const versions = await api.getModrinthVersions(server.id, project.project_id);
      if (versions.length === 0) {
        throw new Error(`No compatible versions found on Modrinth for MC ${server.minecraft_version}`);
      }

      const targetVersion = versions[0];
      const targetFile =
        targetVersion.files.find((f) => f.primary) || targetVersion.files[0];

      if (!targetFile) {
        throw new Error("No downloadable file available for this version");
      }

      // 2. Download and verify hash
      const filename = await api.installModrinthExtension(
        server.id,
        targetFile.url,
        targetFile.filename,
        targetFile.hashes?.sha512 || undefined
      );

      setNotification({
        type: "success",
        message: `Successfully installed ${project.title} (${filename}) with SHA-512 verification!`,
      });
      setTimeout(() => setNotification(null), 5000);
      await loadInstalled();
    } catch (err) {
      setNotification({
        type: "error",
        message: `Failed to install ${project.title}: ${String(err)}`,
      });
    } finally {
      setInstallingProject(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4 relative"
    >
      {/* Drag & drop visual dropzone overlay */}
      {isDraggingOver && (
        <div className="absolute inset-4 z-50 bg-emerald-950/80 border-2 border-dashed border-emerald-400 rounded-2xl flex flex-col items-center justify-center p-6 backdrop-blur-sm animate-in fade-in">
          <Upload className="w-12 h-12 text-emerald-400 animate-bounce mb-3" />
          <h3 className="text-base font-bold text-emerald-200">Drop .jar files here to install</h3>
          <p className="text-xs text-emerald-300/80 mt-1">Files will be installed into your server's {extensionTypeLabel.toLowerCase()} directory</p>
        </div>
      )}
      {/* Top Bar */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground">
            {extensionTypeLabel} Manager
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage installed extensions or discover verified projects on Modrinth
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className={`px-3 py-1.5 text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${isUploading ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className={`w-3.5 h-3.5 text-emerald-400 ${isUploading ? "animate-spin" : ""}`} />
            {isUploading ? "Uploading..." : `Upload ${isModServer ? "Mod" : "Plugin"}`}
            <input
              type="file"
              accept=".jar"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const buffer = await file.arrayBuffer();
                  await handleInstallLocalFile(file.name, new Uint8Array(buffer));
                  e.target.value = "";
                }
              }}
            />
          </label>

          <button
            onClick={async () => {
              try {
                await api.openServerDirectory(server.id);
              } catch (err) {
                setNotification({ type: "error", message: `Failed to open folder: ${String(err)}` });
              }
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors flex items-center gap-1.5"
            title="Open Server Directory in File Explorer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-emerald-400" /> Open Folder
          </button>

          {/* Tab Switcher - Marketplace first, then Installed */}
          <div className="bg-secondary p-1 rounded-lg border border-border flex items-center">
            <button
              onClick={() => setTab("modrinth")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                tab === "modrinth"
                  ? "bg-card text-emerald-400 font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Marketplace
            </button>
            <button
              onClick={() => setTab("installed")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                tab === "installed"
                  ? "bg-card text-emerald-400 font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Installed ({installedItems.length})
            </button>
          </div>
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

      {/* Tab 1: Installed */}
      {tab === "installed" ? (
        <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-secondary/30 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              Active {extensionTypeLabel} in {server.name}
            </span>
            <button
              onClick={loadInstalled}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-2">
            {loadingInstalled ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Scanning extensions directory...
              </div>
            ) : installedItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <Package className="w-10 h-10 text-muted-foreground/30" />
                <div className="text-xs text-muted-foreground max-w-sm">
                  No {extensionTypeLabel.toLowerCase()} installed yet. Head to the{" "}
                  <button
                    onClick={() => setTab("modrinth")}
                    className="text-emerald-400 font-semibold underline"
                  >
                    Modrinth Marketplace
                  </button>{" "}
                  tab to search and install with one click!
                </div>
              </div>
            ) : (
              installedItems.map((item) => (
                <div
                  key={item.file_name}
                  className={`p-3.5 rounded-lg border flex items-center justify-between transition-all ${
                    item.enabled
                      ? "bg-secondary/20 border-border hover:border-border/80"
                      : "bg-secondary/10 border-border/40 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        item.enabled ? "bg-emerald-500/20 text-emerald-400" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{item.name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                            item.enabled
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {item.enabled ? "ENABLED" : "DISABLED"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        {item.file_name} • {formatFileSize(item.file_size_bytes)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggle(item)}
                      className={`p-1 rounded text-xs flex items-center gap-1 font-medium transition-colors ${
                        item.enabled
                          ? "text-emerald-400 hover:text-emerald-300"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={item.enabled ? "Disable extension" : "Enable extension"}
                    >
                      {item.enabled ? (
                        <ToggleRight className="w-6 h-6 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-muted-foreground" />
                      )}
                    </button>

                    <button
                      onClick={() => handleRemove(item)}
                      className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                      title="Permanently remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Tab 2: Modrinth Marketplace */
        <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          {/* Search and Sort Toolbar */}
          <div className="p-4 bg-secondary/30 border-b border-border space-y-3">
            <form
              onSubmit={handleSearchModrinth}
              className="flex items-center gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={`Search or browse Modrinth for ${server.server_type} ${server.minecraft_version} ${extensionTypeLabel.toLowerCase()}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-secondary/70 border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {searching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <span>Search</span>
                )}
              </button>
            </form>

            {/* Quick Sort / Category Filters */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground mr-1">Sort By:</span>
                <button
                  type="button"
                  onClick={() => {
                    setSortIndex("downloads");
                    loadMarketplace(searchQuery, "downloads");
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                    sortIndex === "downloads"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  <Flame className="w-3 h-3 text-amber-400" /> Most Downloaded
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortIndex("follows");
                    loadMarketplace(searchQuery, "follows");
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                    sortIndex === "follows"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-purple-400" /> Most Popular (Follows)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortIndex("updated");
                    loadMarketplace(searchQuery, "updated");
                  }}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1 ${
                    sortIndex === "updated"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-secondary text-muted-foreground hover:text-foreground border border-border"
                  }`}
                >
                  Recently Updated
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground font-mono">
                {searching ? "Loading catalog..." : `${searchResults.length} projects found`}
              </span>
            </div>
          </div>

          {/* Results list */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {searching ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-xs text-muted-foreground">
                  Fetching verified {extensionTypeLabel.toLowerCase()} from Modrinth...
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                <Search className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">
                  Search for verified {extensionTypeLabel.toLowerCase()} on Modrinth (e.g. "LuckPerms",
                  "WorldEdit", "Lithium", "Chunky", "EssentialsX")
                </p>
              </div>
            ) : (
              searchResults.map((proj) => {
                const isInstalling = installingProject === proj.project_id;
                const isAlreadyInstalled = installedItems.some((i) =>
                  i.name.toLowerCase().includes(proj.slug.toLowerCase())
                );

                return (
                  <div
                    key={proj.project_id}
                    className="p-4 bg-secondary/20 border border-border rounded-xl flex items-start justify-between gap-4 hover:border-border/80 transition-all"
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      {proj.icon_url ? (
                        <>
                          <img
                            src={proj.icon_url}
                            alt={proj.title}
                            className="w-12 h-12 rounded-lg object-cover bg-secondary border border-border shrink-0"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                              const fallback = (e.currentTarget as HTMLElement).parentElement?.querySelector('.fallback-ext-icon');
                              if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                            }}
                          />
                          <div className="fallback-ext-icon hidden w-12 h-12 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6" />
                          </div>
                        </>
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
                      )}

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-foreground truncate">
                            {proj.title}
                          </h4>
                          <span className="text-[10px] text-muted-foreground">by {proj.author}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {proj.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {proj.categories.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase font-mono"
                            >
                              {c}
                            </span>
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-2 font-mono">
                            {proj.downloads.toLocaleString()} downloads
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <button
                        onClick={() => handleInstallProject(proj)}
                        disabled={isInstalling}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all shadow-sm ${
                          isAlreadyInstalled
                            ? "bg-secondary text-foreground hover:bg-secondary/80 border border-border"
                            : "bg-emerald-500 hover:bg-emerald-400 text-background shadow-emerald-500/20"
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {isInstalling
                          ? "Verifying & Installing..."
                          : isAlreadyInstalled
                          ? "Reinstall"
                          : "Install"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Marketplace Pagination Footer */}
          {totalHits > 0 && (
            <div className="p-3 bg-secondary/40 border-t border-border flex items-center justify-between text-xs">
              <div className="text-muted-foreground font-mono text-[11px]">
                Showing {Math.min((page - 1) * pageSize + 1, totalHits)}-{Math.min(page * pageSize, totalHits)} of {totalHits.toLocaleString()} results
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadMarketplace(searchQuery, sortIndex, page - 1)}
                  disabled={page <= 1 || searching}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>

                <span className="px-2 py-0.5 rounded bg-card border border-border font-mono text-[11px] text-foreground font-semibold">
                  Page {page} of {Math.max(1, Math.ceil(totalHits / pageSize))}
                </span>

                <button
                  type="button"
                  onClick={() => loadMarketplace(searchQuery, sortIndex, page + 1)}
                  disabled={page * pageSize >= totalHits || searching}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-foreground border border-border disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1 transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* In-app confirmation modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
