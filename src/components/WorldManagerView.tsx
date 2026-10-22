import React, { useState, useEffect } from "react";
import {
  Globe,
  Flame,
  Moon,
    Upload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Compass,
  HardDrive,
  Layers,
} from "lucide-react";
import { ServerProfile, ServerStatus, WorldDetails } from "../types";
import { api } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

interface WorldManagerViewProps {
  server: ServerProfile;
  serverStatus: ServerStatus | null;
}

export const WorldManagerView: React.FC<WorldManagerViewProps> = ({
  server,
  serverStatus,
}) => {
  const [worldInfo, setWorldInfo] = useState<WorldDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  

  // Confirmation modal state
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

  const isRunning = serverStatus?.state === "running" || serverStatus?.state === "starting";

  const loadWorldDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const details = await api.getWorldInfo(server.id);
      setWorldInfo(details);
    } catch (err) {
      setError(`Failed to inspect world files: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorldDetails();
  }, [server.id]);

  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleResetDimension = (dimension: "nether" | "end" | "all") => {
    if (isRunning) {
      setError("Please stop the server before resetting dimensions to prevent file corruption.");
      return;
    }

    if (dimension === "all") {
      setConfirmModal({
        isOpen: true,
        title: "⚠️ Reset Entire World (All Dimensions & Overworld)?",
        message:
          "CRITICAL ACTION: This will permanently delete your entire world directory, including the Overworld, Nether (DIM-1), End (DIM1), player inventories, and structures. A completely new world will generate from scratch upon next server launch. This cannot be undone!",
        confirmText: "Delete All & Reset World",
        variant: "danger",
        onConfirm: async () => {
          try {
            await api.resetDimension(server.id, "all");
            notifySuccess("Entire world reset successfully. A fresh world will be generated on next start.");
            loadWorldDetails();
          } catch (err) {
            setError(`Failed to reset world: ${String(err)}`);
          }
        },
      });
      return;
    }

    const dimLabel = dimension === "nether" ? "The Nether" : "The End";
    setConfirmModal({
      isOpen: true,
      title: `Reset ${dimLabel} Dimension?`,
      message: `This will permanently delete all chunk region data for ${dimLabel} (${
        dimension === "nether" ? "DIM-1" : "DIM1"
      }). The dimension will regenerate fresh from your world seed the next time a portal is entered.`,
      confirmText: `Reset ${dimLabel}`,
      variant: "danger",
      onConfirm: async () => {
        try {
          await api.resetDimension(server.id, dimension);
          notifySuccess(`${dimLabel} dimension reset successfully.`);
          loadWorldDetails();
        } catch (err) {
          setError(`Failed to reset ${dimLabel}: ${String(err)}`);
        }
      },
    });
  };

  const handleImportWorldPicker = async () => {
    if (isRunning) {
      setError("Please stop the server before importing custom worlds.");
      return;
    }

    try {
      const zipPath = await api.pickLocalFile({
        title: "Select World ZIP Archive",
        filterName: "World ZIP Archives (*.zip)",
        extensions: ["zip"],
      });

      if (zipPath) {
        setIsImporting(true);
        setError(null);
        const folderName = await api.importWorldArchive(server.id, zipPath);
        notifySuccess(`World imported successfully as '${folderName}' and set as active.`);
        loadWorldDetails();
      }
    } catch (err) {
      setError(`Import failed: ${String(err)}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">World & Dimension Manager</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage dimensions, reset Nether / End, and import custom adventure maps for{" "}
              <span className="text-emerald-400 font-semibold">{server.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadWorldDetails}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary/80 hover:bg-secondary rounded-lg border border-border text-xs flex items-center gap-1.5 transition-colors"
            title="Refresh World Stats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
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

      {/* Main Content */}
      <div className="flex-1 bg-card border border-border rounded-xl p-5 overflow-y-auto space-y-6">
        {/* World Overview Banner */}
        <div className="bg-secondary/40 border border-border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                Active World: {worldInfo?.level_name || "world"}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                Total Size: {worldInfo?.total_size_mb || 0} MB
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Configured via <code className="text-emerald-400 font-mono">level-name</code> in server.properties.
              {isRunning && (
                <span className="text-amber-400 ml-1.5 font-medium">
                  (Stop server to reset dimensions or import worlds)
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleImportWorldPicker}
              disabled={isRunning || isImporting}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-background text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Upload className="w-4 h-4" />
              {isImporting ? "Importing World..." : "Import Custom World (.zip)"}
            </button>
          </div>
        </div>

        {/* Dimension Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. OVERWORLD */}
          <div className="bg-secondary/30 border border-border/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">The Overworld</h3>
                <span className="text-[11px] text-emerald-400 font-semibold">
                  Size: {worldInfo?.overworld_size_mb || 0} MB
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Contains your primary survival builds, spawn point, player homes, and surface terrain.
              </p>
            </div>
            <div className="pt-2 border-t border-border/50">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <HardDrive className="w-3 h-3" /> Protected primary dimension
              </span>
            </div>
          </div>

          {/* 2. THE NETHER */}
          <div className="bg-secondary/30 border border-border/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">The Nether</h3>
                <span className="text-[11px] text-rose-400 font-semibold">
                  Size: {worldInfo?.nether_size_mb || 0} MB
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fortresses, bastions, netherite chunks, and lava lakes. Resetting generates pristine Nether chunks.
              </p>
            </div>
            <div className="pt-2 border-t border-border/50 space-y-2">
              <button
                onClick={() => handleResetDimension("nether")}
                disabled={isRunning || !worldInfo?.nether_exists}
                className="w-full py-1.5 px-3 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Reset Nether (DIM-1)
              </button>
            </div>
          </div>

          {/* 3. THE END */}
          <div className="bg-secondary/30 border border-border/80 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">The End</h3>
                <span className="text-[11px] text-purple-400 font-semibold">
                  Size: {worldInfo?.end_size_mb || 0} MB
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Central dragon island, End cities, and elytra ships. Resetting respawns dragon and restocks cities.
              </p>
            </div>
            <div className="pt-2 border-t border-border/50 space-y-2">
              <button
                onClick={() => handleResetDimension("end")}
                disabled={isRunning || !worldInfo?.end_exists}
                className="w-full py-1.5 px-3 bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-purple-400" /> Reset The End (DIM1)
              </button>
            </div>
          </div>
        </div>

        {/* World Quick Guide Card */}
        <div className="p-4 bg-secondary/20 border border-border/60 rounded-xl text-xs space-y-2">
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            Dimension Maintenance Best Practices
          </div>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px] leading-relaxed">
            <li>
              <strong>Why reset The End?</strong> When all Elytra and End Cities near the main island have been looted, resetting allows players to fight the dragon again and discover fresh loot without traveling 10,000 blocks.
            </li>
            <li>
              <strong>Why reset The Nether?</strong> If a major Minecraft Nether update is released or ancient debris mining has stripped regions, purging the Nether regenerates new structures based on current world generation.
            </li>
            <li>
              <strong>Automatic Safety:</strong> Resetting dimensions never modifies your player inventories, ender chests, or Overworld builds.
            </li>
          </ul>
        </div>
      </div>

      {/* Confirmation Dialog */}
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

