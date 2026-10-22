import React, { useState, useEffect } from "react";
import {
  Globe,
  Copy,
  Check,
  RotateCw,
  Square,
  Play,
  Terminal,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { ServerProfile, ServerStatus, PortalServerStatus } from "../types";
import { api } from "../lib/api";

interface TunnelViewProps {
  server: ServerProfile;
  serverStatus: ServerStatus | null;
}

export const TunnelView: React.FC<TunnelViewProps> = ({ server, serverStatus }) => {
  const [portalStatus, setPortalStatus] = useState<PortalServerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Load status and listen for updates
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;

    const load = async () => {
      try {
        const s = await api.getPortalStatus(server.id);
        if (isMounted) setPortalStatus(s);
      } catch (err) {
        console.error("Failed to get Portal status:", err);
      }
    };

    load();

    api.listenPortalStatus((status) => {
      if (status.server_id === server.id && isMounted) {
        setPortalStatus(status);
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  }, [server.id]);

  // Periodic log refresh if open
  useEffect(() => {
    if (!showLogs) return;
    let isMounted = true;
    const fetchLogs = async () => {
      try {
        const lines = await api.getPortalLogs(server.id);
        if (isMounted) setLogs(lines);
      } catch (err) {
        console.error("Failed to get Portal logs:", err);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [showLogs, server.id]);

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
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 shrink-0">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">Public Access &amp; Tunnel Setup</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                Portal Raw TCP (gosuda/portal-tunnel)
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Publish your Minecraft Java server globally through trustless, high-performance relays without router port forwarding.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isTunnelRunning ? (
            <button
              onClick={handleStopTunnel}
              disabled={isLoading}
              className="px-3.5 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-rose-300" />
              <span>Stop Tunnel</span>
            </button>
          ) : (
            <button
              onClick={handleStartTunnel}
              disabled={isLoading || isTunnelStarting}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isLoading || isTunnelStarting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Starting Tunnel...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-background" />
                  <span>Enable Public Access</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-card border border-border rounded-xl p-6 overflow-y-auto space-y-6 shadow-sm">
        {/* Tri-Dashboard Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 1. Minecraft Server Health */}
          <div className="bg-secondary/40 border border-border p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Minecraft Server
            </span>
            <div className="my-3 flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isServerRunning ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"
                }`}
              />
              <span className="text-base font-bold text-foreground">
                {isServerRunning ? "Running" : "Stopped"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              Port {server.port} (127.0.0.1)
            </span>
          </div>

          {/* 2. Portal Tunnel Process */}
          <div className="bg-secondary/40 border border-border p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Portal Process
            </span>
            <div className="my-3 flex items-center gap-2.5">
              <span
                className={`w-3 h-3 rounded-full ${
                  isTunnelRunning
                    ? "bg-emerald-400"
                    : isTunnelStarting
                    ? "bg-amber-400 animate-pulse"
                    : isError
                    ? "bg-rose-400"
                    : "bg-muted-foreground"
                }`}
              />
              <span className="text-base font-bold text-foreground capitalize">
                {portalStatus?.status.state.replace("_", " ") || "Offline"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Windows Job Object Protected
            </span>
          </div>

          {/* 3. Public Connectivity */}
          <div className="bg-secondary/40 border border-border p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Public Connectivity
            </span>
            <div className="my-3 flex items-center gap-2.5">
              <Globe
                className={`w-4 h-4 ${
                  isTunnelRunning ? "text-emerald-400" : "text-muted-foreground"
                }`}
              />
              <span className="text-base font-bold text-foreground">
                {publicAddress ? "Online (Global)" : "Disconnected"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {publicAddress ? "Accessible globally" : "No port forwarding needed"}
            </span>
          </div>
        </div>

        {/* Server Offline Reminder */}
        {!isServerRunning && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              Your Minecraft server is currently <strong>stopped</strong>. Start the server in the <strong>Console &amp; Logs</strong> tab so friends can connect to your public address.
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
              {errorMessage || "Failed to start Portal tunnel process."}
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

        {/* Public Address Ready Card */}
        {publicAddress && (
          <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
              <span>✨ Special thanks to Portal (<a href="https://github.com/gosuda/portal-tunnel" target="_blank" rel="noreferrer" className="underline hover:text-emerald-200">gosuda/portal-tunnel</a>) for trustless raw TCP relaying</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Globe className="w-5 h-5" />
                <span>Your Public Server Address (Minecraft Java Edition)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                  Online &amp; Ready
                </span>
              </div>
            </div>

            <p className="text-xs text-foreground/80 leading-relaxed">
              Send this address to your friends anywhere in the world. They can paste it directly into Minecraft &gt; <strong>Multiplayer</strong> &gt; <strong>Direct Connection</strong>.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 bg-background/90 border border-emerald-500/30 rounded-lg px-4 py-3 font-mono text-sm font-bold text-emerald-300 tracking-wider flex items-center justify-between">
                <span>{publicAddress}</span>
                <span className="text-[10px] font-sans text-muted-foreground uppercase">Minecraft Java Direct Connect</span>
              </div>
              <button
                onClick={() => handleCopy(publicAddress)}
                className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95 shrink-0"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copied!" : "Copy Address"}</span>
              </button>
            </div>

            {portalStatus?.relay_url && (
              <p className="text-[11px] text-emerald-400/90 font-mono">
                Connected Relay: {portalStatus.relay_url}
              </p>
            )}
          </div>
        )}

        {/* Architecture & Relay Information Card */}
        <div className="p-4 rounded-xl bg-secondary/30 border border-border space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Portal Tunnel Architecture &amp; Security</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            MCSet integrates <strong className="text-foreground">gosuda/portal-tunnel</strong> to publish your local Minecraft TCP port to trustless public relays. A cryptographic identity (<span className="font-mono text-[11px] text-foreground">identity.json</span>) is stored with your server profile so that your tunnel hostname remains consistent across sessions. Raw TCP forwarding is isolated and managed under a Windows Job Object with zero open ports on your local router.
          </p>
        </div>

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
    </div>
  );
};
