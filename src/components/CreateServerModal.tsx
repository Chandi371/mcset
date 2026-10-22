import React, { useState, useEffect } from "react";
import {
  Server,
  Layers,
  Search,
  Package,
  Download,
  Cpu,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  X,
  Folder,
  FolderOpen,
  Archive,
  RefreshCw,
  FileCode,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import {
  CreateServerRequest,
  DownloadProgressPayload,
  InstallModpackRequest,
  JavaRuntime,
  MinecraftVersionEntry,
  ModpackInstallProgress,
  ModpackProject,
  ModpackVersionInfo,
  ProviderBuildInfo,
  ServerProfile,
  ServerType,
  VersionManifest,
} from "../types";
import { api } from "../lib/api";
import { getRecommendedJava, findMatchingRuntime } from "../lib/javaDetection";

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: (server: ServerProfile) => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onServerCreated,
}) => {
  // Top-level Mode: "standard" (Vanilla/Software) | "modpack" (Modpack Browser)
  const [mainCategory, setMainCategory] = useState<"standard" | "modpack">("standard");

  // Common Configuration State
  const [name, setName] = useState("");
  const [serverType, setServerType] = useState<ServerType>("paper");
  const [mcVersion, setMcVersion] = useState("1.21.1");
  const [port, setPort] = useState(25565);
  const [minRamGb, setMinRamGb] = useState(2);
  const [maxRamGb, setMaxRamGb] = useState(4);
  const [acceptEula, setAcceptEula] = useState(false);
  const [isCracked, setIsCracked] = useState(false);
  const [javaPath, setJavaPath] = useState<string>("");
  const [detectedJavas, setDetectedJavas] = useState<JavaRuntime[]>([]);
  const [downloadingJdkMajor, setDownloadingJdkMajor] = useState<number | null>(null);
  const [jdkProgress, setJdkProgress] = useState<{
    step: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
  } | null>(null);
  const [jdkDownloadError, setJdkDownloadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Standard Server Mode: "fresh" | "zip" | "directory"
  const [creationMode, setCreationMode] = useState<"fresh" | "zip" | "directory">("fresh");
  const [importZipPath, setImportZipPath] = useState("");
  const [existingDirPath, setExistingDirPath] = useState("");

  // Manifest & Software resolution state (Standard)
  const [manifest, setManifest] = useState<VersionManifest | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [versionSearch, setVersionSearch] = useState("");
  const [versionCategory, setVersionCategory] = useState<"all" | "release" | "snapshot" | "old">("release");
  const [resolvedBuild, setResolvedBuild] = useState<ProviderBuildInfo | null>(null);
  const [resolvingBuild, setResolvingBuild] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  // Standard Download Progress
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgressPayload | null>(null);

  // ---------------------------------------------------------------------------
  // Modpack Server State
  // ---------------------------------------------------------------------------
  const [modpackProvider, setModpackProvider] = useState<"modrinth" | "curseforge">("modrinth");
  const [modpackQuery, setModpackQuery] = useState("");
  const [modpackLoaderFilter, setModpackLoaderFilter] = useState<string>("all");
  const [modpackVersionFilter, setModpackVersionFilter] = useState<string>("");
  const [modpackProjects, setModpackProjects] = useState<ModpackProject[]>([]);
  const [modpackLoading, setModpackLoading] = useState(false);
  const [modpackPage, setModpackPage] = useState<number>(0);
  const [modpackTotalHits, setModpackTotalHits] = useState<number>(0);
  const MODPACK_PAGE_SIZE = 12;
  const [localModpackZip, setLocalModpackZip] = useState("");

  // Selected Modpack Project & Version
  const [selectedProject, setSelectedProject] = useState<ModpackProject | null>(null);
  const [projectVersions, setProjectVersions] = useState<ModpackVersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ModpackVersionInfo | null>(null);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Modpack Installation Progress
  const [activeInstallId, setActiveInstallId] = useState<string | null>(null);
  const [modpackProgress, setModpackProgress] = useState<ModpackInstallProgress | null>(null);
  const [manifestJavaMajor, setManifestJavaMajor] = useState<number | null>(null);

  // Dismiss on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelAndClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, activeInstallId]);

  // Load Java runtimes and Minecraft version manifest on open
  useEffect(() => {
    if (isOpen) {
      api.detectJavaRuntimes().then((runtimes) => {
        if (runtimes && Array.isArray(runtimes)) {
          setDetectedJavas(runtimes);
          if (runtimes.length > 0) {
            const rec = getRecommendedJava(mcVersion, manifestJavaMajor);
            const matching = findMatchingRuntime(runtimes, rec.major) || runtimes[0];
            setJavaPath(matching.path);
          }
        }
      });

      loadVersions(false);
      fetchModpacks(0, "", "modrinth", "all", "");
    }
  }, [isOpen]);

  // Auto-align selected Java with authoritative Minecraft version manifest
  useEffect(() => {
    if (!mcVersion) return;
    let isCurrent = true;
    api.getMinecraftRequiredJava(mcVersion)
      .then((major) => {
        if (isCurrent && typeof major === "number") {
          setManifestJavaMajor(major);
          const rec = getRecommendedJava(mcVersion, major);
          const matching = findMatchingRuntime(detectedJavas, rec.major);
          if (matching) {
            setJavaPath(matching.path);
          }
        }
      })
      .catch(() => {
        const rec = getRecommendedJava(mcVersion, manifestJavaMajor);
        const matching = findMatchingRuntime(detectedJavas, rec.major);
        if (matching) {
          setJavaPath(matching.path);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [mcVersion, detectedJavas]);

  useEffect(() => {
    const targetMc = selectedVersion?.game_versions?.[0];
    if (!targetMc) return;
    let isCurrent = true;
    api.getMinecraftRequiredJava(targetMc)
      .then((major) => {
        if (isCurrent && typeof major === "number") {
          setManifestJavaMajor(major);
          const rec = getRecommendedJava(targetMc, major);
          const matching = findMatchingRuntime(detectedJavas, rec.major);
          if (matching) {
            setJavaPath(matching.path);
          }
        }
      })
      .catch(() => {
        const rec = getRecommendedJava(targetMc);
        const matching = findMatchingRuntime(detectedJavas, rec.major);
        if (matching) {
          setJavaPath(matching.path);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedVersion, detectedJavas]);

  const handleDownloadJdk = async (targetMajor: number) => {
    setDownloadingJdkMajor(targetMajor);
    setJdkDownloadError(null);
    setJdkProgress({
      step: `Connecting to Adoptium for Java ${targetMajor}...`,
      percent: 0,
      downloaded_bytes: 0,
      total_bytes: 0,
    });

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.listenJdkProgress((progress) => {
        if (progress.major_version === targetMajor) {
          setJdkProgress({
            step: progress.step,
            percent: progress.percent,
            downloaded_bytes: progress.downloaded_bytes,
            total_bytes: progress.total_bytes,
          });
        }
      });

      const installed = await api.downloadJavaRuntime(targetMajor);
      const refreshed = await api.detectJavaRuntimes();
      setDetectedJavas(refreshed);
      setJavaPath(installed.path);
      setJdkProgress(null);
      setDownloadingJdkMajor(null);
    } catch (err: any) {
      console.error(`Failed to download Java ${targetMajor}:`, err);
      setJdkDownloadError(
        typeof err === "string"
          ? err
          : err?.message || `Failed to download Java ${targetMajor}`
      );
      setDownloadingJdkMajor(null);
    } finally {
      if (unlisten) unlisten();
    }
  };

  // Ensure modpacks are immediately populated when switching to modpack mode
  useEffect(() => {
    if (isOpen && mainCategory === "modpack" && modpackProjects.length === 0 && !modpackLoading) {
      fetchModpacks(0, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter);
    }
  }, [isOpen, mainCategory]);

  // Subscribe to standard download progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isOpen && mainCategory === "standard") {
      api.listenDownloadProgress((payload) => {
        setDownloadProgress(payload);
      }).then((fn) => {
        unlisten = fn;
      });
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen, mainCategory]);

  // Subscribe to modpack install progress whenever modal is open
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    if (isOpen) {
      api.listenModpackProgress((payload) => {
        setModpackProgress(payload);
      }).then((fn) => {
        unlisten = fn;
      });
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  const loadVersions = async (forceRefresh = false) => {
    setManifestLoading(true);
    setBuildError(null);
    try {
      const data = await api.getMinecraftVersions(forceRefresh);
      setManifest(data);
      if (data.latest && data.latest.release) {
        if (!mcVersion || !data.versions.some((v: MinecraftVersionEntry) => v.id === mcVersion)) {
          setMcVersion(data.latest.release);
        }
      }
    } catch (err) {
      console.error("Failed to load versions:", err);
      setError(`Failed to fetch version catalogue: ${err}`);
    } finally {
      setManifestLoading(false);
    }
  };

  // Re-resolve standard build when provider or version changes
  useEffect(() => {
    if (creationMode !== "fresh" || !mcVersion || mainCategory !== "standard") return;

    let isMounted = true;
    setResolvingBuild(true);
    setBuildError(null);

    api.resolveProviderBuild(serverType, mcVersion)
      .then((build) => {
        if (isMounted) {
          setResolvedBuild(build);
          setBuildError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setResolvedBuild(null);
          setBuildError(String(err));
        }
      })
      .finally(() => {
        if (isMounted) setResolvingBuild(false);
      });

    return () => {
      isMounted = false;
    };
  }, [serverType, mcVersion, creationMode, mainCategory]);

  // Search/fetch modpacks with pagination
  const fetchModpacks = async (
    page: number = 0,
    query: string = modpackQuery,
    provider: "modrinth" | "curseforge" = modpackProvider,
    loader: string = modpackLoaderFilter,
    version?: string
  ) => {
    setModpackLoading(true);
    setError(null);
    try {
      const v = version !== undefined ? version : modpackVersionFilter;
      const resp = await api.searchModpacks(
        provider,
        query,
        v && v.trim() ? v.trim() : undefined,
        loader !== "all" ? loader : undefined,
        page * MODPACK_PAGE_SIZE,
        MODPACK_PAGE_SIZE,
        undefined
      );
      setModpackProjects(resp.hits || []);
      setModpackTotalHits(resp.total_hits || 0);
      setModpackPage(page);
    } catch (err) {
      console.error("Modpack search error:", err);
      setError(String(err));
      setModpackProjects([]);
      setModpackTotalHits(0);
    } finally {
      setModpackLoading(false);
    }
  };

  // Handle selecting a modpack project
  const handleSelectProject = async (project: ModpackProject) => {
    setSelectedProject(project);
    // Sanitize title to avoid directory path issues while preserving descriptive name
    const sanitizedTitle = project.title.replace(/[:\/\\|?*<>"']/g, " ").trim();
    setName(sanitizedTitle || project.title);
    setVersionsLoading(true);
    setProjectVersions([]);
    setSelectedVersion(null);
    setError(null);

    try {
      const versions = await api.getModpackVersions(
        project.provider,
        project.id,
        undefined
      );
      setProjectVersions(versions);
      if (versions.length > 0) {
        setSelectedVersion(versions[0]);
      }
    } catch (err) {
      console.error("Failed to load modpack versions:", err);
      setError(`Could not fetch versions for this modpack: ${err}`);
    } finally {
      setVersionsLoading(false);
    }
  };

  // Cancel active installation and cleanly close/exit modal
  const handleCancelAndClose = async () => {
    if (activeInstallId) {
      try {
        await api.cancelModpackInstall(activeInstallId);
      } catch (err) {
        console.error("Cancel failed:", err);
      }
    }
    setLoading(false);
    setActiveInstallId(null);
    setModpackProgress(null);
    setDownloadProgress(null);
    setError(null);
    onClose();
  };

  // Standard server creation submit
  const handleCreateStandard = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please provide a server name");
      return;
    }

    if (minRamGb > maxRamGb) {
      setError("Minimum RAM cannot exceed Maximum RAM");
      return;
    }

    if (!acceptEula) {
      setError("You must review and accept the Minecraft EULA before creating the server.");
      return;
    }

    if (creationMode === "zip" && !importZipPath.trim()) {
      setError("Please specify the path to your server zip archive.");
      return;
    }

    if (creationMode === "directory" && !existingDirPath.trim()) {
      setError("Please specify the path to your existing server directory.");
      return;
    }

    if (creationMode === "fresh" && buildError) {
      setError(`Cannot create server: ${buildError}`);
      return;
    }

    setLoading(true);
    setDownloadProgress({
      status: "fetching_metadata",
      bytes_downloaded: 0,
      message:
        creationMode === "zip"
          ? "Extracting server zip archive..."
          : creationMode === "directory"
          ? "Importing existing server files..."
          : "Resolving server software...",
    });

    try {
      const req: CreateServerRequest = {
        name: name.trim(),
        server_type: serverType,
        minecraft_version: mcVersion,
        java_path: javaPath || undefined,
        min_ram_mb: minRamGb * 1024,
        max_ram_mb: maxRamGb * 1024,
        jvm_flags: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200",
        port: Number(port),
        accept_eula: acceptEula,
        online_mode: !isCracked,
        import_mode: creationMode,
        import_zip_path: creationMode === "zip" ? importZipPath.trim() : undefined,
        existing_dir_path: creationMode === "directory" ? existingDirPath.trim() : undefined,
      };

      const server = await api.createServer(req);
      onServerCreated(server);
      onClose();
    } catch (err) {
      console.error("Server creation failed:", err);
      setError(`Installation failed: ${err}`);
    } finally {
      setLoading(false);
      setDownloadProgress(null);
    }
  };

  // Modpack server installation submit
  const handleInstallModpack = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedProject && !localModpackZip.trim()) {
      setError("Please select a modpack or choose a local pack zip.");
      return;
    }

    if (!selectedVersion && !localModpackZip.trim()) {
      setError("Please select a modpack version to install.");
      return;
    }

    if (!name.trim()) {
      setError("Please provide a server name");
      return;
    }

    if (minRamGb > maxRamGb) {
      setError("Minimum RAM cannot exceed Maximum RAM");
      return;
    }

    if (!acceptEula) {
      setError("You must review and accept the Minecraft EULA before creating the server.");
      return;
    }

    if (!selectedVersion && selectedProject?.provider !== "local") {
      setError("Please select a modpack release version before proceeding.");
      return;
    }

    const installId = `install_${Date.now()}`;
    setActiveInstallId(installId);
    setLoading(true);
    setModpackProgress({
      install_id: installId,
      step: "Starting download",
      progress_percent: 5,
      details: "Connecting to modpack repository and preparing server workspace...",
      current_file: null,
      files_completed: 0,
      total_files: 0,
      bytes_downloaded: 0,
      total_bytes: 0,
    });

    try {
      const req: InstallModpackRequest = {
        install_id: installId,
        name: name.trim(),
        provider: selectedProject ? selectedProject.provider : "local",
        project_id: selectedProject ? selectedProject.id : "local",
        version_id: selectedVersion ? selectedVersion.id : "local",
        download_url: selectedVersion ? selectedVersion.download_url : "",
        port: Number(port),
        min_ram_mb: minRamGb * 1024,
        max_ram_mb: maxRamGb * 1024,
        accept_eula: acceptEula,
        online_mode: !isCracked,
        java_path: javaPath || undefined,
        jvm_flags: "-XX:+UseG1GC -XX:+ParallelRefProcEnabled",
        curseforge_api_key: undefined,
        local_archive_path: localModpackZip.trim() || undefined,
      };

      const server = await api.installModpackServer(req);
      onServerCreated(server);
      onClose();
    } catch (err) {
      console.error("Modpack install failed:", err);
      setError(`Modpack installation failed: ${err}`);
    } finally {
      setLoading(false);
      setActiveInstallId(null);
      setModpackProgress(null);
    }
  };

  // Filter versions in manifest for standard mode
  const filteredVersions = manifest?.versions.filter((v: MinecraftVersionEntry) => {
    const matchesSearch = v.id.toLowerCase().includes(versionSearch.toLowerCase());
    if (!matchesSearch) return false;
    if (versionCategory === "all") return true;
    if (versionCategory === "release") return v.type === "release";
    if (versionCategory === "snapshot") return v.type === "snapshot";
    if (versionCategory === "old") return v.type.includes("beta") || v.type.includes("alpha");
    return true;
  }) || [];

  const softwareOptions: { type: ServerType; title: string; category: string; desc: string }[] = [
    {
      type: "paper",
      title: "Paper",
      category: "High Performance",
      desc: "Highly optimized Spigot-compatible software with Bukkit plugins and anti-xray.",
    },
    {
      type: "purpur",
      title: "Purpur",
      category: "Feature Rich",
      desc: "Drop-in Paper replacement designed for extensive gameplay customization and performance.",
    },
    {
      type: "fabric",
      title: "Fabric",
      category: "Mod Loader",
      desc: "Fast, modular mod loader with rapid updates and excellent mod ecosystem.",
    },
    {
      type: "neoforge",
      title: "NeoForge",
      category: "Mod Loader",
      desc: "Community-driven modern fork of Forge for rich 1.20.2+ content mods.",
    },
    {
      type: "forge",
      title: "Forge",
      category: "Mod Loader",
      desc: "Traditional heavy mod loader supporting extensive tech, magic, and legacy modpacks.",
    },
    {
      type: "quilt",
      title: "Quilt",
      category: "Mod Loader",
      desc: "Open, modular mod loader built with Fabric compatibility and modern tooling.",
    },
    {
      type: "vanilla",
      title: "Vanilla",
      category: "Official",
      desc: "Official Mojang dedicated server software directly from Mojang's distribution network.",
    },
  ];

  if (!isOpen) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancelAndClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in"
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Create New Server</h2>
              <p className="text-xs text-muted-foreground">
                Deploy a vanilla server, high-performance paper node, or a full 1-click modpack server
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelAndClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-secondary transition-colors"
            title="Cancel and close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top-Level Mode Selector */}
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 pb-2 bg-secondary/10 border-b border-border">
          <button
            type="button"
            onClick={() => {
              if (!loading) {
                setError(null);
                setMainCategory("standard");
              }
            }}
            disabled={loading}
            className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
              mainCategory === "standard"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm"
                : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70"
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                mainCategory === "standard"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              <Server className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Vanilla &amp; Custom Server</div>
              <div className="text-[11px] text-muted-foreground">Paper, Fabric, Purpur, NeoForge, Forge, Vanilla, or ZIP import</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!loading) {
                setError(null);
                setMainCategory("modpack");
              }
            }}
            disabled={loading}
            className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
              mainCategory === "modpack"
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-sm"
                : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground hover:bg-secondary/70"
            }`}
          >
            <div
              className={`p-2 rounded-lg ${
                mainCategory === "modpack"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-foreground">Modpack Server</div>
              <div className="text-[11px] text-muted-foreground">Modrinth 1-click installer (.mrpack &amp; local archives)</div>
            </div>
          </button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* =================================================================== */}
        {/* MODE A: MODPACK SERVER WORKFLOW                                    */}
        {/* =================================================================== */}
        {mainCategory === "modpack" ? (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Active Modpack Installation Progress Overlay */}
            {loading && modpackProgress && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-300">
                      Step: {modpackProgress.step}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {Math.round(modpackProgress.progress_percent)}%
                  </span>
                </div>

                <div className="w-full bg-secondary/80 rounded-full h-2.5 overflow-hidden border border-border">
                  <div
                    className="bg-emerald-500 h-2.5 transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(3, modpackProgress.progress_percent))}%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate max-w-[450px]">
                    {modpackProgress.details}
                  </span>
                  {modpackProgress.total_files > 0 && (
                    <span className="font-mono text-emerald-400/90 font-semibold shrink-0">
                      {modpackProgress.files_completed} / {modpackProgress.total_files} mods
                    </span>
                  )}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleCancelAndClose}
                    className="px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Cancel Installation
                  </button>
                </div>
              </div>
            )}

            {!selectedProject ? (
              /* Sub-view: Search & Browse Modpacks */
              <div className="space-y-4">
                {/* Provider selection tabs */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModpackProvider("modrinth");
                        setModpackPage(0);
                        fetchModpacks(0, modpackQuery, "modrinth", modpackLoaderFilter, modpackVersionFilter);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 bg-emerald-500 text-background shadow-md shadow-emerald-500/20"
                    >
                      <span>Modrinth</span>
                      <span className="text-[10px] opacity-80 font-normal">Official .mrpack</span>
                    </button>
                    <div
                      className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 bg-secondary/50 text-muted-foreground/60 border border-border/50 cursor-not-allowed select-none"
                      title="CurseForge integration is an upcoming feature"
                    >
                      <span>CurseForge</span>
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">Upcoming Feature</span>
                    </div>
                  </div>

                  {/* Manual local archive import link */}
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span>Have a downloaded pack?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const path = await api.pickLocalFile({
                            title: "Select Modpack File (.mrpack or .zip)",
                            filterName: "Modpack Archives (*.mrpack, *.zip)",
                            extensions: ["mrpack", "zip"],
                          });
                          if (path && path.trim()) {
                            const trimmed = path.trim();
                            setLocalModpackZip(trimmed);
                            const fileName = trimmed.split(/[\\/]/).pop() || "Local Modpack";
                            setSelectedProject({
                              id: "local_import",
                              slug: "local-modpack",
                              title: fileName.replace(/\.(mrpack|zip)$/i, ""),
                              description: `Imported from ${trimmed}`,
                              author: "Local Archive",
                              downloads: 1,
                              follows: 0,
                              categories: ["modpack"],
                              loaders: ["fabric", "forge", "neoforge", "quilt"],
                              game_versions: ["Any"],
                              provider: "local",
                            });
                            setName(fileName.replace(/\.(mrpack|zip)$/i, "").replace(/[-_]/g, " "));
                          }
                        } catch (err) {
                          console.error("Failed to select local modpack file:", err);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-secondary hover:bg-secondary/80 border border-border text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Browse Local Pack (.mrpack / .zip)...
                    </button>
                  </div>
                </div>



                {/* Search Bar & Filters */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search Modrinth modpacks (e.g. Cobblemon, All the Mods, Better MC)..."
                      value={modpackQuery}
                      onChange={(e) => setModpackQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          setModpackPage(0);
                          fetchModpacks(0, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter);
                        }
                      }}
                      className="w-full bg-secondary/60 border border-border rounded-lg pl-9 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>

                  {/* Loader Filter */}
                  <select
                    value={modpackLoaderFilter}
                    onChange={(e) => {
                      setModpackLoaderFilter(e.target.value);
                      setModpackPage(0);
                      fetchModpacks(0, modpackQuery, modpackProvider, e.target.value, modpackVersionFilter);
                    }}
                    className="bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-semibold"
                  >
                    <option value="all">All Loaders</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                  </select>

                  {/* Minecraft Version Filter */}
                  <input
                    type="text"
                    placeholder="MC Ver (e.g. 1.20.1)"
                    value={modpackVersionFilter}
                    onChange={(e) => {
                      setModpackVersionFilter(e.target.value);
                    }}
                    onBlur={() => {
                      setModpackPage(0);
                      fetchModpacks(0, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter);
                    }}
                    className="w-28 bg-secondary/60 border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setModpackPage(0);
                      fetchModpacks(0, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter);
                    }}
                    disabled={modpackLoading}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-background font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                  >
                    {modpackLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Search</span>
                  </button>
                </div>

                {/* Modpack Project Cards Grid */}
                {modpackLoading ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                    <p className="text-xs text-muted-foreground font-mono">
                      Querying Modrinth modpack index...
                    </p>
                  </div>
                ) : modpackProjects.length === 0 ? (
                  <div className="py-14 text-center space-y-2 border border-dashed border-border rounded-xl">
                    <Package className="w-8 h-8 mx-auto text-muted-foreground opacity-50" />
                    <p className="text-xs font-semibold text-foreground">No modpacks found</p>
                    <p className="text-[11px] text-muted-foreground">
                      Try searching with different terms or click Browse Local Pack (.mrpack / .zip).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 max-h-[480px] overflow-y-auto pr-1">
                    {modpackProjects.map((pack) => (
                      <div
                        key={pack.id}
                        onClick={() => handleSelectProject(pack)}
                        className="p-3.5 bg-secondary/30 hover:bg-secondary/60 border border-border hover:border-emerald-500/40 rounded-xl cursor-pointer transition-all flex flex-col justify-between space-y-3 group"
                      >
                        <div className="flex items-start gap-3">
                          {pack.icon_url ? (
                            <img
                              src={pack.icon_url}
                              alt={pack.title}
                              className="w-12 h-12 rounded-lg object-cover shrink-0 bg-background border border-border group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                              <Package className="w-6 h-6" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-xs font-bold text-foreground truncate group-hover:text-emerald-400 transition-colors">
                                {pack.title}
                              </h4>
                            </div>
                            <p className="text-[10px] text-muted-foreground">by {pack.author}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
                              {pack.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {pack.loaders.slice(0, 2).map((l) => (
                              <span
                                key={l}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono uppercase"
                              >
                                {l}
                              </span>
                            ))}
                            {pack.game_versions.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">
                                MC {pack.game_versions[0]}
                              </span>
                            )}
                          </div>
                          <span className="text-muted-foreground font-mono">
                            {(pack.downloads || 0).toLocaleString()} dl
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pagination Controls & Bottom Dismiss */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    {modpackTotalHits > 0 ? (
                      <>
                        Showing{" "}
                        <span className="font-semibold text-foreground">
                          {modpackPage * MODPACK_PAGE_SIZE + 1}
                        </span>
                        {" - "}
                        <span className="font-semibold text-foreground">
                          {Math.min((modpackPage + 1) * MODPACK_PAGE_SIZE, modpackTotalHits)}
                        </span>{" "}
                        of{" "}
                        <span className="font-semibold text-foreground">
                          {modpackTotalHits.toLocaleString()}
                        </span>{" "}
                        modpacks
                      </>
                    ) : (
                      "No modpacks found"
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={modpackPage === 0 || modpackLoading}
                      onClick={() => fetchModpacks(modpackPage - 1, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter)}
                      className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg font-semibold disabled:opacity-40 transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-mono px-2 text-foreground">
                      Page {modpackPage + 1} of {Math.max(1, Math.ceil(modpackTotalHits / MODPACK_PAGE_SIZE))}
                    </span>
                    <button
                      type="button"
                      disabled={(modpackPage + 1) * MODPACK_PAGE_SIZE >= modpackTotalHits || modpackLoading}
                      onClick={() => fetchModpacks(modpackPage + 1, modpackQuery, modpackProvider, modpackLoaderFilter, modpackVersionFilter)}
                      className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg font-semibold disabled:opacity-40 transition-colors"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelAndClose}
                      className="ml-3 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground bg-secondary/40 hover:bg-secondary/80 border border-border rounded-lg transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Sub-view: Selected Modpack Version, EULA, RAM & Installation Details */
              <form onSubmit={handleInstallModpack} className="space-y-5 animate-in fade-in">
                {/* Back button & Selected pack banner */}
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {selectedProject.icon_url && (
                      <img
                        src={selectedProject.icon_url}
                        alt={selectedProject.title}
                        className="w-10 h-10 rounded-lg object-cover bg-background border border-border"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          {selectedProject.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase font-mono font-semibold">
                          {selectedProject.provider}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Author: {selectedProject.author} • Choose release version and server settings below
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!loading) {
                        setSelectedProject(null);
                        setSelectedVersion(null);
                      }
                    }}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg font-semibold transition-colors"
                  >
                    Change Modpack
                  </button>
                </div>

                {/* Server Name & Port */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Server Name <span className="text-emerald-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      disabled={loading}
                      placeholder="e.g. My Modpack Server"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      Server Port
                    </label>
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      disabled={loading}
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full bg-secondary/60 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono"
                    />
                  </div>
                </div>

                {/* Modpack Version Selector */}
                <div className="space-y-2 p-3.5 bg-secondary/30 border border-border rounded-xl">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                      Select Modpack Release Version
                    </label>
                    {versionsLoading && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                        Fetching versions...
                      </span>
                    )}
                  </div>

                  {projectVersions.length > 0 ? (
                    <div className="grid grid-cols-1 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {projectVersions.map((v) => (
                        <div
                          key={v.id}
                          onClick={() => setSelectedVersion(v)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                            selectedVersion?.id === v.id
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-semibold"
                              : "bg-secondary/40 border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono">{v.version_number || v.name}</span>
                            {v.game_versions.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                                MC {v.game_versions.join(", ")}
                              </span>
                            )}
                            {v.loaders.length > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 uppercase font-mono">
                                {v.loaders.join(", ")}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-mono opacity-80 shrink-0">
                            {v.file_size ? `${(v.file_size / (1024 * 1024)).toFixed(1)} MB` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : !versionsLoading ? (
                    <p className="text-[11px] text-muted-foreground py-2">
                      No explicit version catalog returned. You can still proceed with automatic pack resolution.
                    </p>
                  ) : null}
                </div>

                {/* RAM Allocation with Custom Huge RAM Support */}
                <div className="p-4 bg-secondary/20 border border-border rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                      Server Memory Allocation (RAM)
                    </span>
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      {minRamGb} GB min / {maxRamGb} GB max
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={Math.max(64, maxRamGb)}
                      step={1}
                      disabled={loading}
                      value={maxRamGb}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setMaxRamGb(val);
                        if (minRamGb > val) setMinRamGb(val);
                      }}
                      className="flex-1 accent-emerald-500 h-2 bg-secondary rounded-lg cursor-pointer disabled:opacity-50"
                    />

                    {/* Direct Custom Huge RAM Number Input */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={1024}
                        disabled={loading}
                        value={maxRamGb}
                        onChange={(e) => {
                          const val = Math.max(1, Number(e.target.value));
                          setMaxRamGb(val);
                          if (minRamGb > val) setMinRamGb(Math.min(minRamGb, val));
                        }}
                        className="w-20 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center font-bold"
                      />
                      <span className="text-xs font-bold text-muted-foreground">GB</span>
                    </div>
                  </div>

                  {/* Quick RAM presets */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Presets:</span>
                    {[2, 4, 8, 12, 16, 32, 64, 128].map((ram) => (
                      <button
                        key={ram}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setMaxRamGb(ram);
                          if (minRamGb > ram) setMinRamGb(ram);
                        }}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                          maxRamGb === ram
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                            : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                        }`}
                      >
                        {ram}G
                      </button>
                    ))}
                  </div>
                </div>

                {/* Java Runtime Dropdown & Auto-installer */}
                {(() => {
                  const modpackMc =
                    selectedVersion?.game_versions?.[0] || modpackVersionFilter || "1.21.1";
                  const rec = getRecommendedJava(modpackMc, manifestJavaMajor);
                  const matchingJava = findMatchingRuntime(detectedJavas, rec.major);

                  return (
                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                            Java Runtime
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {rec.reason}
                          </span>
                        </label>
                        <select
                          value={javaPath}
                          disabled={loading || downloadingJdkMajor !== null}
                          onChange={(e) => setJavaPath(e.target.value)}
                          className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        >
                          {detectedJavas.map((j) => (
                            <option key={j.path} value={j.path}>
                              {j.vendor} Java {j.major_version} ({j.version_str})
                              {j.major_version === rec.major ? " — Recommended" : ""}
                            </option>
                          ))}
                          {detectedJavas.length === 0 && (
                            <option value="">System Default Java (PATH)</option>
                          )}
                        </select>
                      </div>

                      {/* If matching Java runtime is missing or not installed */}
                      {!matchingJava && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                              <span className="text-xs text-amber-200">
                                <strong>{rec.label}</strong> is required for Minecraft {modpackMc}, but not found on your system.
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDownloadJdk(rec.major)}
                              disabled={downloadingJdkMajor !== null}
                              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded shadow flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                            >
                              {downloadingJdkMajor === rec.major ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Downloading...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Download Java {rec.major}</span>
                                </>
                              )}
                            </button>
                          </div>

                          {downloadingJdkMajor === rec.major && jdkProgress && (
                            <div className="space-y-1 pt-1 border-t border-amber-500/20">
                              <div className="flex justify-between text-[11px] text-amber-200">
                                <span>{jdkProgress.step}</span>
                                <span className="font-mono">{jdkProgress.percent.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-amber-400 h-1.5 rounded-full transition-all duration-200"
                                  style={{ width: `${Math.min(100, Math.max(5, jdkProgress.percent))}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {jdkDownloadError && (
                            <p className="text-[11px] text-rose-300">{jdkDownloadError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Cracked / Offline Mode Option */}
                <div className="flex items-start gap-3 p-3 bg-secondary/30 border border-border/70 rounded-lg">
                  <input
                    type="checkbox"
                    id="cracked-modpack"
                    disabled={loading}
                    checked={isCracked}
                    onChange={(e) => setIsCracked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border accent-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="cracked-modpack" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                    <span className="font-semibold text-foreground block mb-0.5">Cracked / Offline Mode</span>
                    Allow players with non-premium or offline launchers to join (<code className="text-[10px] text-amber-400 font-mono">online-mode=false</code>). Leave unchecked to require official Mojang accounts (<code className="text-[10px] text-emerald-400 font-mono">online-mode=true</code>).
                  </label>
                </div>

                {/* EULA Agreement (Required Gating) */}
                <div className="flex items-start gap-3 p-3 bg-secondary/40 border border-border rounded-lg">
                  <input
                    type="checkbox"
                    id="eula-modpack"
                    disabled={loading}
                    checked={acceptEula}
                    onChange={(e) => setAcceptEula(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-border accent-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="eula-modpack" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                    I agree to the{" "}
                    <a
                      href="https://aka.ms/MinecraftEULA"
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 underline hover:text-emerald-300"
                    >
                      Minecraft End User License Agreement (EULA)
                    </a>{" "}
                    on behalf of this server profile before installation and startup.
                  </label>
                </div>

                {/* Submit Action Button */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancelAndClose}
                    className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProject(null);
                      setSelectedVersion(null);
                    }}
                    disabled={loading}
                    className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Back to Modpacks
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !acceptEula}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-background font-bold text-xs rounded-lg flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Installing Modpack Server...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" />
                        <span>Install Modpack Server</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* =================================================================== */
          /* MODE B: STANDARD SERVER WORKFLOW (Vanilla, Paper, Fabric, ZIP, etc) */
          /* =================================================================== */
          <form onSubmit={handleCreateStandard} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Active Download/Installation Overlay */}
            {loading && downloadProgress && (
              <div className="p-4 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-2">
                    <Download className="w-4 h-4 animate-bounce text-emerald-400" />
                    {downloadProgress.status === "verifying"
                      ? "Verifying Checksum..."
                      : downloadProgress.status === "installing"
                      ? "Running Server Installer..."
                      : "Downloading Server Software..."}
                  </span>
                  {downloadProgress.progress_percent !== undefined &&
                    downloadProgress.progress_percent !== null && (
                      <span className="text-xs font-mono text-emerald-400">
                        {Math.round(downloadProgress.progress_percent)}%
                      </span>
                    )}
                </div>

                <div className="w-full bg-secondary/80 rounded-full h-2 overflow-hidden border border-border">
                  <div
                    className="bg-emerald-500 h-2 transition-all duration-300 rounded-full"
                    style={{
                      width: `${
                        downloadProgress.progress_percent !== undefined &&
                        downloadProgress.progress_percent !== null
                          ? Math.min(100, Math.max(5, downloadProgress.progress_percent))
                          : 100
                      }%`,
                    }}
                  />
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {downloadProgress.message}
                </p>
              </div>
            )}

            {/* Server Creation Mode Selector */}
            <div className="space-y-2 p-3.5 bg-secondary/30 border border-border rounded-xl">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Installation &amp; Source Mode</span>
                <span className="text-[10px] text-muted-foreground">Select how to initialize this server</span>
              </label>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCreationMode("fresh")}
                  disabled={loading}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-semibold transition-all ${
                    creationMode === "fresh"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  <Server className="w-4 h-4 text-emerald-400" />
                  <span>Software Catalogue</span>
                  <span className="text-[10px] font-normal opacity-70">Automated builds</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCreationMode("zip")}
                  disabled={loading}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-semibold transition-all ${
                    creationMode === "zip"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  <Archive className="w-4 h-4 text-sky-400" />
                  <span>Upload ZIP</span>
                  <span className="text-[10px] font-normal opacity-70">Unpack zip file</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCreationMode("directory")}
                  disabled={loading}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border text-xs font-semibold transition-all ${
                    creationMode === "directory"
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground border-border hover:bg-secondary/80"
                  }`}
                >
                  <Folder className="w-4 h-4 text-amber-400" />
                  <span>Existing Folder</span>
                  <span className="text-[10px] font-normal opacity-70">Import local directory</span>
                </button>
              </div>

              {/* ZIP Path input */}
              {creationMode === "zip" && (
                <div className="pt-2 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Archive className="w-3.5 h-3.5 text-sky-400" />
                      Server ZIP Archive <span className="text-sky-400">*</span>
                    </label>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        try {
                          const file = await api.pickLocalFile({
                            title: "Select Server ZIP Archive",
                            filterName: "ZIP Archives (*.zip)",
                            extensions: ["zip"],
                            directory: false,
                          });
                          if (file) {
                            setImportZipPath(file);
                            if (!name.trim()) {
                              const base = file.split(/[\\/]/).pop()?.replace(/\.zip$/i, "") || "";
                              if (base) setName(base.replace(/[-_]/g, " "));
                            }
                          }
                        } catch (err) {
                          console.error("Failed to select ZIP archive:", err);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-400 hover:text-sky-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Browse ZIP File...
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="Click 'Browse ZIP File...' or enter full path"
                    value={importZipPath}
                    onChange={(e) => setImportZipPath(e.target.value)}
                    className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    MCSet will extract worlds, configs, and plugins, and automatically detect your server jar file.
                  </p>
                </div>
              )}

              {/* Existing Folder input */}
              {creationMode === "directory" && (
                <div className="pt-2 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-amber-400" />
                      Existing Server Directory <span className="text-amber-400">*</span>
                    </label>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={async () => {
                        try {
                          const folder = await api.pickLocalFile({
                            title: "Select Existing Minecraft Server Folder",
                            directory: true,
                          });
                          if (folder) {
                            setExistingDirPath(folder);
                            if (!name.trim()) {
                              const base = folder.split(/[\\/]/).pop() || "";
                              if (base) setName(base.replace(/[-_]/g, " "));
                            }
                          }
                        } catch (err) {
                          console.error("Failed to select server folder:", err);
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Browse Server Folder...
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    disabled={loading}
                    placeholder="Click 'Browse Server Folder...' or enter folder path"
                    value={existingDirPath}
                    onChange={(e) => setExistingDirPath(e.target.value)}
                    className="w-full bg-background/80 border border-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    All worlds, player data, and configurations will be securely imported into your MCSet library.
                  </p>
                </div>
              )}
            </div>

            {/* Server Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Server Name <span className="text-emerald-400">*</span>
              </label>
              <input
                type="text"
                required
                disabled={loading}
                placeholder="e.g. Survival with Friends"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-secondary/60 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
              />
            </div>

            {/* Dynamic Minecraft Version Selector */}
            <div className="space-y-2 p-4 bg-secondary/20 border border-border rounded-xl">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                  Minecraft Version Catalogue
                </label>
                <div className="flex items-center gap-2">
                  {manifest?.is_stale && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Offline Cache
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => loadVersions(true)}
                    disabled={manifestLoading || loading}
                    className="text-[11px] text-muted-foreground hover:text-emerald-400 flex items-center gap-1 transition-colors disabled:opacity-50"
                    title="Force refresh version catalogue from Mojang"
                  >
                    <RefreshCw className={`w-3 h-3 ${manifestLoading ? "animate-spin" : ""}`} />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {/* Version Category Filters and Search */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 border border-border text-[11px]">
                  {(["release", "snapshot", "all"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVersionCategory(cat)}
                      className={`px-2.5 py-1 rounded-md font-medium transition-colors capitalize ${
                        versionCategory === cat
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search versions (e.g. 1.21.4, 26.3)..."
                    value={versionSearch}
                    onChange={(e) => setVersionSearch(e.target.value)}
                    className="w-full bg-secondary/60 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Version Grid / Dropdown */}
              <div className="grid grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1 bg-background/50 border border-border rounded-lg">
                {filteredVersions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={loading}
                    onClick={() => setMcVersion(v.id)}
                    className={`px-2 py-1.5 rounded text-xs font-mono text-left transition-colors flex items-center justify-between ${
                      mcVersion === v.id
                        ? "bg-emerald-500 text-background font-bold shadow-sm"
                        : "hover:bg-secondary/70 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{v.id}</span>
                    {v.type === "release" && (
                      <span
                        className={`text-[9px] px-1 rounded ${
                          mcVersion === v.id
                            ? "bg-emerald-900/60 text-emerald-200"
                            : "bg-emerald-500/10 text-emerald-400"
                        }`}
                      >
                        rel
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Software Provider Selection */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                Select Software Provider
              </label>
              <div className="grid grid-cols-2 gap-2">
                {softwareOptions.map((opt) => {
                  const isSelected = serverType === opt.type;
                  return (
                    <button
                      key={opt.type}
                      type="button"
                      disabled={loading}
                      onClick={() => setServerType(opt.type)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "bg-emerald-500/10 border-emerald-500/50 shadow-sm"
                          : "bg-secondary/30 border-border hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-foreground">{opt.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground uppercase font-mono">
                          {opt.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Software Resolution & Checksum Status */}
            <div className="p-3.5 bg-secondary/30 border border-border rounded-lg space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Software Build Resolution
                </span>
                {resolvingBuild && (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                    Resolving build...
                  </span>
                )}
              </div>

              {resolvedBuild && !resolvingBuild && (
                <div className="space-y-1.5 pt-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Build / Artifact:</span>
                    <span className="font-mono text-emerald-400">
                      {resolvedBuild.build_id} ({resolvedBuild.filename})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Download Source:</span>
                    <span className="font-mono text-foreground truncate max-w-[280px]" title={resolvedBuild.download_url}>
                      {new URL(resolvedBuild.download_url).hostname}
                    </span>
                  </div>
                  {resolvedBuild.checksum_value && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Integrity ({resolvedBuild.checksum_type?.toUpperCase()}):</span>
                      <span className="font-mono text-muted-foreground truncate max-w-[200px]" title={resolvedBuild.checksum_value}>
                        {resolvedBuild.checksum_value.slice(0, 16)}...
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-emerald-400 pt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Compatible build verified for Minecraft {mcVersion}</span>
                  </div>
                </div>
              )}

              {buildError && !resolvingBuild && (
                <div className="p-2.5 bg-rose-500/15 border border-rose-500/30 rounded text-rose-300 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <p className="font-medium">Software Compatibility Error</p>
                    <p className="text-rose-200/80 mt-0.5">{buildError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Port & Java Runtime */}
            {(() => {
              const rec = getRecommendedJava(mcVersion, manifestJavaMajor);
              const matchingJava = findMatchingRuntime(detectedJavas, rec.major);

              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground">Server Port</label>
                      <input
                        type="number"
                        min={1024}
                        max={65535}
                        disabled={loading}
                        value={port}
                        onChange={(e) => setPort(Number(e.target.value))}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono disabled:opacity-50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                          Java Runtime
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {rec.reason}
                        </span>
                      </label>
                      <select
                        value={javaPath}
                        disabled={loading || downloadingJdkMajor !== null}
                        onChange={(e) => setJavaPath(e.target.value)}
                        className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
                      >
                        {detectedJavas.map((j) => (
                          <option key={j.path} value={j.path}>
                            {j.vendor} Java {j.major_version} ({j.version_str})
                            {j.major_version === rec.major ? " — Recommended" : ""}
                          </option>
                        ))}
                        {detectedJavas.length === 0 && (
                          <option value="">System Default Java (PATH)</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Missing required Java banner */}
                  {!matchingJava && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="text-xs text-amber-200">
                            <strong>{rec.label}</strong> is required for Minecraft {mcVersion}, but not found on your system.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadJdk(rec.major)}
                          disabled={downloadingJdkMajor !== null}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded shadow flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                        >
                          {downloadingJdkMajor === rec.major ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Downloading...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Download Java {rec.major}</span>
                            </>
                          )}
                        </button>
                      </div>

                      {downloadingJdkMajor === rec.major && jdkProgress && (
                        <div className="space-y-1 pt-1 border-t border-amber-500/20">
                          <div className="flex justify-between text-[11px] text-amber-200">
                            <span>{jdkProgress.step}</span>
                            <span className="font-mono">{jdkProgress.percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-amber-400 h-1.5 rounded-full transition-all duration-200"
                              style={{ width: `${Math.min(100, Math.max(5, jdkProgress.percent))}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {jdkDownloadError && (
                        <p className="text-[11px] text-rose-300">{jdkDownloadError}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* RAM Allocation with Custom Huge Input & Presets */}
            <div className="p-4 bg-secondary/20 border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  Memory Allocation (RAM)
                </span>
                <span className="text-xs font-mono text-emerald-400 font-bold">
                  {minRamGb} GB min / {maxRamGb} GB max
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={Math.max(64, maxRamGb)}
                  step={1}
                  disabled={loading}
                  value={maxRamGb}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMaxRamGb(val);
                    if (minRamGb > val) setMinRamGb(val);
                  }}
                  className="flex-1 accent-emerald-500 h-2 bg-secondary rounded-lg cursor-pointer disabled:opacity-50"
                />

                {/* Direct Custom Huge RAM Number Input */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={1024}
                    disabled={loading}
                    value={maxRamGb}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value));
                      setMaxRamGb(val);
                      if (minRamGb > val) setMinRamGb(Math.min(minRamGb, val));
                    }}
                    className="w-20 bg-background border border-border rounded-lg px-2 py-1 text-xs font-mono text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center font-bold"
                  />
                  <span className="text-xs font-bold text-muted-foreground">GB</span>
                </div>
              </div>

              {/* Quick RAM presets */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-muted-foreground mr-1">Presets:</span>
                {[2, 4, 8, 12, 16, 32, 64, 128].map((ram) => (
                  <button
                    key={ram}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setMaxRamGb(ram);
                      if (minRamGb > ram) setMinRamGb(ram);
                    }}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                      maxRamGb === ram
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {ram}G
                  </button>
                ))}
              </div>
            </div>

            {/* Cracked / Offline Mode Option */}
            <div className="flex items-start gap-3 p-3 bg-secondary/30 border border-border/70 rounded-lg">
              <input
                type="checkbox"
                id="cracked-standard"
                disabled={loading}
                checked={isCracked}
                onChange={(e) => setIsCracked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border accent-emerald-500 cursor-pointer"
              />
              <label htmlFor="cracked-standard" className="text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                <span className="font-semibold text-foreground block mb-0.5">Cracked / Offline Mode</span>
                Allow players with non-premium or offline launchers to join (<code className="text-[10px] text-amber-400 font-mono">online-mode=false</code>). Leave unchecked to require official Mojang accounts (<code className="text-[10px] text-emerald-400 font-mono">online-mode=true</code>).
              </label>
            </div>

            {/* EULA Agreement (Must not be automatically accepted) */}
            <div className="flex items-start gap-3 p-3 bg-secondary/40 border border-border rounded-lg">
              <input
                type="checkbox"
                id="eula"
                disabled={loading}
                checked={acceptEula}
                onChange={(e) => setAcceptEula(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-border accent-emerald-500 cursor-pointer"
              />
              <label htmlFor="eula" className="text-xs text-muted-foreground leading-snug cursor-pointer">
                I agree to the{" "}
                <a
                  href="https://aka.ms/MinecraftEULA"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 underline hover:text-emerald-300"
                >
                  Minecraft End User License Agreement (EULA)
                </a>{" "}
                on behalf of this server profile before starting the server.
              </label>
            </div>

            {/* Footer */}
            <div className="border-t border-border pt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelAndClose}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || (creationMode === "fresh" && (!resolvedBuild || !!buildError)) || !acceptEula}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-background font-bold text-xs rounded-lg flex items-center gap-2 shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deploying Server...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Create Server</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
