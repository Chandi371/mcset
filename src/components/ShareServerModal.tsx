import React, { useState, useEffect } from "react";
import {
  Globe,
  X,
  Copy,
  Check,
  RotateCw,
  Square,
  Play,
  Terminal,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Share2,
} from "lucide-react";
import { ServerProfile, ServerStatus, PortalServerStatus } from "../types";
import { api } from "../lib/api";

interface ShareServerModalProps {
  server: ServerProfile;
  serverStatus: ServerStatus | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareServerModal: React.FC<ShareServerModalProps> = ({
  server,
  serverStatus,
  isOpen,
  onClose,
}) => {
  const [portalStatus, setPortalStatus] = useState<PortalServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Load status and listen for updates
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;

    const load = async () => {
      try {
        const s = await api.getPortalStatus(server.id);
        setPortalStatus(s);
      } catch (err) {
        console.error("Failed to get Portal status:", err);
      }
    };

    load();

    api.listenPortalStatus((status) => {
      if (status.server_id === server.id) {
        setPortalStatus(status);
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen, server.id]);

  // Periodically refresh logs if logs panel is open
  useEffect(() => {
    if (!isOpen || !showLogs) return;

    const fetchLogs = () => {
      api.getPortalLogs(server.id)
        .then(setLogs)
        .catch(console.error);
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, [isOpen, showLogs, server.id]);

  if (!isOpen) return null;

  const handleStartTunnel = async () => {
    setIsLoading(true);
    try {
      const s = await api.startPortalTunnel(server.id);
      setPortalStatus(s);
    } catch (err) {
      console.error("Failed to start Portal tunnel:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopTunnel = async () => {
    setIsLoading(true);
    try {
      const s = await api.stopPortalTunnel(server.id);
      setPortalStatus(s);
    } catch (err) {
      console.error("Failed to stop Portal tunnel:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isServerRunning = serverStatus?.state === "running";
  const isTunnelRunning = portalStatus?.is_running && (portalStatus?.status.state === "ready" || portalStatus?.status.state === "connected");
  const isTunnelStarting = portalStatus?.is_running && (portalStatus?.status.state === "starting" || portalStatus?.status.state === "connecting");
  const publicAddress = portalStatus?.public_address || (portalStatus?.status.state === "ready" || portalStatus?.status.state === "connected" ? portalStatus.status.data?.public_address : null);
  const isError = portalStatus?.status.state === "error";
  const errorMessage = portalStatus?.last_error || (portalStatus?.status.state === "error" ? portalStatus.status.data?.message : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden text-card-foreground">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                Share with Friends (Public Access)
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  Portal Raw TCP
                </span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Zero port-forwarding trustless relay tunnel for Minecraft Java Edition.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Health Status Dashboard Grid */}
          <div className="grid grid-cols-3 gap-3">
            {/* 1. Minecraft Server Health */}
            <div className="bg-background/60 border border-border p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Minecraft Server
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isServerRunning ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm font-bold text-foreground">
                  {isServerRunning ? "Running" : "Stopped"}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1 font-mono">
                Port {server.port} (127.0.0.1)
              </span>
            </div>

            {/* 2. Portal Tunnel Health */}
            <div className="bg-background/60 border border-border p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Portal Tunnel
              </span>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isTunnelRunning
                      ? "bg-emerald-400"
                      : isTunnelStarting
                      ? "bg-amber-400 animate-pulse"
                      : isError
                      ? "bg-rose-400"
                      : "bg-muted-foreground"
                  }`}
                />
                <span className="text-sm font-bold text-foreground capitalize">
                  {portalStatus?.status.state.replace("_", " ") || "Offline"}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">
                Trustless Portal relay
              </span>
            </div>

            {/* 3. Public Connectivity */}
            <div className="bg-background/60 border border-border p-3.5 rounded-xl flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Public Connectivity
              </span>
              <div className="mt-2 flex items-center gap-2">
                <Globe
                  className={`w-4 h-4 ${
                    isTunnelRunning ? "text-emerald-400" : "text-muted-foreground"
                  }`}
                />
                <span className="text-sm font-bold text-foreground">
                  {publicAddress ? "Online" : "Disconnected"}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-1">
                {publicAddress ? "Direct connection ready" : "No port forward needed"}
              </span>
            </div>
          </div>

          {/* Minecraft Server Offline Warning */}
          {!isServerRunning && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                Your Minecraft server is currently <strong>stopped</strong>. Start the server in the Console tab so connecting players can join.
              </span>
            </div>
          )}

          {/* Error Banner */}
          {isError && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertCircle className="w-4 h-4" />
                <span>Portal Tunnel Error</span>
              </div>
              <p className="text-rose-200/90 leading-relaxed font-mono text-[11px]">
                {errorMessage || "Failed to initialize Portal tunnel process"}
              </p>
              <button
                onClick={handleStartTunnel}
                disabled={isLoading}
                className="mt-1 px-3 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-lg font-semibold flex items-center gap-1.5 text-xs transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          )}

          {/* Connected Public Address Card */}
          {publicAddress && (
            <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-500/10 via-card to-background border border-emerald-500/30 space-y-3 shadow-sm">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
                <span>✨ Special thanks to Portal (<a href="https://github.com/gosuda/portal-tunnel" target="_blank" rel="noreferrer" className="underline hover:text-emerald-200">gosuda/portal-tunnel</a>) for trustless raw TCP relaying</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Public Minecraft Address
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                    Forwarded to 127.0.0.1:{server.port}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-background/90 border border-emerald-500/30 rounded-xl p-3 shadow-inner">
                <code className="text-base font-bold text-emerald-300 font-mono tracking-tight select-all">
                  {publicAddress}
                </code>
                <button
                  onClick={() => handleCopy(publicAddress)}
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-background font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy Address
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                Give this clean address to friends. They can paste it directly into Minecraft Java &gt; Multiplayer &gt; Direct Connection without any extra software.
              </p>

              {portalStatus?.relay_url && (
                <p className="text-[11px] text-emerald-400/90 font-mono">
                  Relay: {portalStatus.relay_url}
                </p>
              )}
            </div>
          )}

          {/* Offline Instructions when Tunnel is Stopped */}
          {!portalStatus?.is_running && !isError && (
            <div className="p-4 rounded-xl bg-secondary/50 border border-border space-y-2">
              <h4 className="text-xs font-bold text-foreground">How it works:</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                MCSet uses <strong className="text-foreground">gosuda/portal-tunnel</strong> to create a trustless raw TCP relay. Your local IP and router ports remain completely safe and unexposed.
              </p>
              <div className="pt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero port forwarding • Cryptographic persistent identity • Minecraft Java TCP</span>
              </div>
            </div>
          )}

          {/* Diagnostic Logs Drawer Toggle */}
          <div className="pt-2 border-t border-border">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors font-medium"
            >
              <Terminal className="w-3.5 h-3.5" />
              {showLogs ? "Hide Portal Diagnostic Logs" : "Show Portal Diagnostic Logs"}
            </button>

            {showLogs && (
              <div className="mt-3 p-3 bg-zinc-950 border border-border rounded-xl font-mono text-[11px] text-zinc-300 max-h-48 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <span className="text-zinc-500 italic">No Portal tunnel logs recorded yet.</span>
                ) : (
                  logs.map((line, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {portalStatus?.is_running && (
              <button
                onClick={handleStartTunnel}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" /> Restart Tunnel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors"
            >
              Close
            </button>

            {portalStatus?.is_running ? (
              <button
                onClick={handleStopTunnel}
                disabled={isLoading}
                className="px-4 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 fill-rose-300" />
                )}
                Stop Public Tunnel
              </button>
            ) : (
              <button
                onClick={handleStartTunnel}
                disabled={isLoading}
                className="px-4 py-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md shadow-primary/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                Enable Public Access
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
