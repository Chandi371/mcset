import React, { useState, useEffect, useRef } from "react";
import {
  Terminal as TerminalIcon,
  Send,
  Trash2,
  Copy,
  Check,
  Search,
  AlertTriangle,
  Play,
  Square,
  RotateCw,
  Wifi,
  Globe,
  Loader2,
  RefreshCw,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Coffee,
  Download,
} from "lucide-react";
import { ServerProfile, ServerStatus, PortalServerStatus } from "../types";
import { api } from "../lib/api";
import { ShareServerModal } from "./ShareServerModal";
import { detectJavaIssue } from "../lib/javaDetection";

interface ConsoleViewProps {
  server: ServerProfile;
  status: ServerStatus | null;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export const ConsoleView: React.FC<ConsoleViewProps> = ({
  server,
  status,
  onStart,
  onStop,
  onRestart,
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "errors" | "warnings">("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedKind, setCopiedKind] = useState<string | null>(null);
  const [networkAddrs, setNetworkAddrs] = useState<{ local_ip: string; lan_ip?: string | null }>({
    local_ip: "127.0.0.1",
    lan_ip: null,
  });
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [portalStatus, setPortalStatus] = useState<PortalServerStatus | null>(null);
  const [isPortalBusy, setIsPortalBusy] = useState(false);
  const [isVerifyingPortal, setIsVerifyingPortal] = useState(false);
  const [showPortalLogs, setShowPortalLogs] = useState(false);
  const [portalLogs, setPortalLogs] = useState<string[]>([]);
  const [portalNotice, setPortalNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isFixingJava, setIsFixingJava] = useState(false);
  const [javaFixProgress, setJavaFixProgress] = useState<{
    step: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
  } | null>(null);
  const [javaFixError, setJavaFixError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getNetworkAddresses()
      .then((addrs) => setNetworkAddrs(addrs))
      .catch((err) => console.error("Failed to detect network addresses:", err));

    api.getPortalStatus(server.id)
      .then((s) => setPortalStatus(s))
      .catch((err) => console.error("Failed to fetch Portal status:", err));

    let unlistenPortal: (() => void) | undefined;
    api.listenPortalStatus((s) => {
      if (s.server_id === server.id) {
        setPortalStatus(s);
      }
    }).then((cleanup) => {
      unlistenPortal = cleanup;
    });

    return () => {
      if (unlistenPortal) unlistenPortal();
    };
  }, [server.id]);

  // Fetch initial logs and listen for live events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    api.getServerLogs(server.id).then((initial) => {
      if (active) {
        setLogs(initial);
      }
    });

    api.listenConsole(server.id, (payload) => {
      if (!active) return;
      setLogs((prev) => {
        if (prev.length > 0 && prev[prev.length - 1] === payload.line) {
          return prev;
        }
        return [...prev, payload.line];
      });
    }).then((cleanup) => {
      if (!active) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [server.id]);

  useEffect(() => {
    if (autoScroll) {
      logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    const cmdToSend = command.trim();
    setCommand("");
    try {
      await api.sendConsoleCommand(server.id, cmdToSend);
    } catch (err) {
      setLogs((prev) => [...prev, `[MCSet Error]: ${String(err)}`]);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const handleCopyConnectAddress = async (addr: string, kind: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(addr);
      }
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 2500);
    } catch (err) {
      console.warn("Failed to copy address:", err);
    }
  };

  const handleStartPortal = async () => {
    setIsPortalBusy(true);
    setPortalNotice(null);
    try {
      const s = await api.startPortalTunnel(server.id);
      setPortalStatus(s);
    } catch (err) {
      setPortalNotice({ type: "error", text: String(err) });
    } finally {
      setIsPortalBusy(false);
    }
  };

  const handleStopPortal = async () => {
    setIsPortalBusy(true);
    setPortalNotice(null);
    try {
      const s = await api.stopPortalTunnel(server.id);
      setPortalStatus(s);
    } catch (err) {
      setPortalNotice({ type: "error", text: String(err) });
    } finally {
      setIsPortalBusy(false);
    }
  };

  const handleVerifyConnectivity = async () => {
    setIsVerifyingPortal(true);
    setPortalNotice(null);
    try {
      const s = await api.verifyPortalConnectivity(server.id);
      setPortalStatus(s);
      if (s.is_verified) {
        setPortalNotice({ type: "success", text: "Direct public connection verified! Minecraft players can connect." });
      } else {
        setPortalNotice({
          type: "error",
          text: "Verification handshake timed out. If newly allocated, relay propagation can take a few seconds.",
        });
      }
    } catch (err) {
      setPortalNotice({ type: "error", text: String(err) });
    } finally {
      setIsVerifyingPortal(false);
    }
  };

  const handleTogglePortalLogs = async () => {
    if (!showPortalLogs) {
      try {
        const l = await api.getPortalLogs(server.id);
        setPortalLogs(l);
      } catch (err) {
        console.error("Failed to fetch Portal logs:", err);
      }
    }
    setShowPortalLogs(!showPortalLogs);
  };

  const filteredLogs = logs.filter((line) => {
    const matchesText = filter ? line.toLowerCase().includes(filter.toLowerCase()) : true;
    if (!matchesText) return false;

    if (levelFilter === "errors") {
      return (
        line.toLowerCase().includes("error") ||
        line.toLowerCase().includes("exception") ||
        line.toLowerCase().includes("fatal")
      );
    }
    if (levelFilter === "warnings") {
      return line.toLowerCase().includes("warn");
    }
    return true;
  });

  const javaIssue = React.useMemo(() => {
    // Only flag issues if server is not running healthy
    if (status?.state === "running") return null;
    return detectJavaIssue(logs, server, status?.error_message);
  }, [logs, server, status?.state, status?.error_message]);

  const handleAutoFixJava = async (targetMajor?: number) => {
    const major = targetMajor || javaIssue?.targetMajor;
    if (!major) return;

    setIsFixingJava(true);
    setJavaFixError(null);
    setJavaFixProgress({
      step: `Connecting to Adoptium for Java ${major}...`,
      percent: 0,
      downloaded_bytes: 0,
      total_bytes: 0,
    });

    let unlisten: (() => void) | undefined;
    try {
      unlisten = await api.listenJdkProgress((progress) => {
        if (progress.major_version === major) {
          setJavaFixProgress({
            step: progress.step,
            percent: progress.percent,
            downloaded_bytes: progress.downloaded_bytes,
            total_bytes: progress.total_bytes,
          });
        }
      });

      await api.autoFixServerJava(server.id, major);
      setJavaFixProgress(null);
      setIsFixingJava(false);
    } catch (err: any) {
      console.error("Failed to auto-fix Java runtime:", err);
      setJavaFixError(
        typeof err === "string"
          ? err
          : err?.message || "Failed to download and configure Java runtime."
      );
      setIsFixingJava(false);
    } finally {
      if (unlisten) unlisten();
    }
  };

  const isRunning = status?.state === "running";
  const isStarting = status?.state === "starting";
  const isStopping = status?.state === "stopping";
  const isCrashed = status?.state === "crashed";

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-foreground">{server.name} Console</h2>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1.5 ${
                isRunning
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : isStarting
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse"
                  : isStopping
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
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
              {status?.state || "Stopped"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {server.server_type.toUpperCase()} {server.minecraft_version} • Port {server.port} • Directory:{" "}
            <code className="text-emerald-400 font-mono text-[11px]">{server.server_dir}</code>
          </p>
        </div>

        {/* Lifecycle action buttons */}
        <div className="flex items-center gap-2">
          {isRunning || isStarting ? (
            <>
              <button
                onClick={onRestart}
                disabled={isStarting || isStopping}
                className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCw className="w-3.5 h-3.5" /> Restart
              </button>
              <button
                onClick={onStop}
                disabled={isStopping}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 fill-rose-300" /> Stop Server
              </button>
            </>
          ) : (
            <button
              onClick={onStart}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-background" /> Start Server
            </button>
          )}
        </div>
      </div>

      {/* Server Connection Banner with Integrated Public Address */}
      <div className="bg-card/90 border border-border p-4 rounded-xl space-y-3.5 shadow-sm">
        {/* Header row: Local & LAN */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground tracking-wide">CONNECT DIRECTLY</span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
                  Port {server.port}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                In Minecraft &gt; <strong className="text-foreground">Multiplayer</strong> &gt; <strong className="text-foreground">Direct Connection</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Local Connection IP:Port */}
            <div className="flex items-center bg-secondary/80 border border-border hover:border-emerald-500/40 rounded-lg overflow-hidden font-mono text-xs transition-colors shadow-inner">
              <span className="px-2.5 py-1 text-[10px] uppercase font-sans font-semibold text-muted-foreground bg-secondary/60 border-r border-border">
                This PC
              </span>
              <span
                onClick={() => handleCopyConnectAddress(`127.0.0.1:${server.port}`, "local")}
                title="Click to copy local address"
                className="px-2.5 py-1 font-bold text-emerald-400 cursor-pointer hover:bg-emerald-500/10 transition-colors select-all"
              >
                127.0.0.1:{server.port}
              </span>
              <button
                onClick={() => handleCopyConnectAddress(`127.0.0.1:${server.port}`, "local")}
                title="Copy local connection address"
                className="px-2 py-1 hover:bg-emerald-500/20 hover:text-emerald-300 text-muted-foreground border-l border-border transition-colors flex items-center gap-1 active:scale-95"
              >
                {copiedKind === "local" ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {/* LAN Connection IP:Port */}
            {networkAddrs?.lan_ip && (
              <div className="flex items-center bg-secondary/80 border border-border hover:border-sky-500/40 rounded-lg overflow-hidden font-mono text-xs transition-colors shadow-inner">
                <span className="px-2.5 py-1 text-[10px] uppercase font-sans font-semibold text-sky-400 bg-sky-500/10 border-r border-border">
                  Same Wi-Fi
                </span>
                <span
                  onClick={() => handleCopyConnectAddress(`${networkAddrs.lan_ip}:${server.port || 25565}`, "lan")}
                  title="Click to copy LAN address"
                  className="px-2.5 py-1 font-bold text-sky-300 cursor-pointer hover:bg-sky-500/10 transition-colors select-all"
                >
                  {networkAddrs.lan_ip}:{server.port || 25565}
                </span>
                <button
                  onClick={() => handleCopyConnectAddress(`${networkAddrs.lan_ip}:${server.port || 25565}`, "lan")}
                  title="Copy LAN address for friends on same Wi-Fi"
                  className="px-2 py-1 hover:bg-sky-500/20 hover:text-sky-300 text-muted-foreground border-l border-border transition-colors flex items-center gap-1 active:scale-95"
                >
                  {copiedKind === "lan" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Public Internet (Portal Tunnel) Address */}
            {portalStatus?.public_address && (
              <div className="flex items-center bg-secondary/80 border border-emerald-500/50 hover:border-emerald-400 rounded-lg overflow-hidden font-mono text-xs transition-colors shadow-inner">
                <span className="px-2.5 py-1 text-[10px] uppercase font-sans font-bold text-emerald-400 bg-emerald-500/15 border-r border-border flex items-center gap-1">
                  <Globe className="w-3 h-3 text-emerald-400" />
                  Public (Portal)
                </span>
                <span
                  onClick={() => handleCopyConnectAddress(portalStatus.public_address!, "public_bar")}
                  title="Click to copy public address"
                  className="px-2.5 py-1 font-bold text-emerald-400 cursor-pointer hover:bg-emerald-500/10 transition-colors select-all"
                >
                  {portalStatus.public_address}
                </span>
                <button
                  onClick={() => handleCopyConnectAddress(portalStatus.public_address!, "public_bar")}
                  title="Copy public address for friends anywhere in the world"
                  className="px-2 py-1 hover:bg-emerald-500/20 hover:text-emerald-300 text-muted-foreground border-l border-border transition-colors flex items-center gap-1 active:scale-95"
                >
                  {copiedKind === "public_bar" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Public Tunnel Section (Portal Raw TCP) */}
        <div>
          {!isRunning && !isStarting ? (
            /* CASE 0: Server Stopped - Prompt to start first */
            <div className="p-3 bg-secondary/30 border border-border/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-secondary text-muted-foreground shrink-0 border border-border">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-foreground">Public Internet Sharing (Portal Tunnel)</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Start your Minecraft server above to share it with friends outside your local network.
                  </p>
                </div>
              </div>
              <button
                onClick={onStart}
                className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-emerald-300" />
                <span>Start Server First</span>
              </button>
            </div>
          ) : portalStatus?.public_address ? (
            /* CASE 1: Public Address Ready & Verified! */
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3 shadow-sm">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 text-[11px] font-medium text-emerald-300 border border-emerald-500/25">
                <span>✨ Special thanks to Portal (<a href="https://github.com/gosuda/portal-tunnel" target="_blank" rel="noreferrer" className="underline hover:text-emerald-200">gosuda/portal-tunnel</a>) for trustless raw TCP relaying</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">
                        Public Address (Share With Friends)
                      </span>
                      {portalStatus.is_verified ? (
                        <span className="text-[10px] bg-emerald-500/25 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Live &amp; Verified</span>
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 font-medium px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                          <span>Allocated (Checking Reachability)</span>
                        </span>
                      )}
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-medium px-2 py-0.5 rounded border border-emerald-500/30">
                        Portal Raw TCP
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Friends anywhere in the world can connect directly via Minecraft Multiplayer Direct Connection!
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Public Host:Port Display and Copy */}
                  <div className="flex items-center bg-card border border-emerald-500/40 rounded-lg overflow-hidden font-mono text-xs shadow-sm">
                    <span
                      onClick={() => handleCopyConnectAddress(portalStatus.public_address!, "public")}
                      title="Click to copy full public address"
                      className="px-3 py-1.5 font-bold text-emerald-400 cursor-pointer hover:bg-emerald-500/10 transition-colors select-all"
                    >
                      {portalStatus.public_address}
                    </span>
                    <button
                      onClick={() => handleCopyConnectAddress(portalStatus.public_address!, "public")}
                      title="Copy public address"
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-background font-semibold border-l border-emerald-600 transition-colors flex items-center gap-1.5"
                    >
                      {copiedKind === "public" ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Address</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Separate Port Copy Button if address contains a port */}
                  {portalStatus.public_address.includes(":") && (
                    <button
                      onClick={() => {
                        const port = portalStatus.public_address!.split(":")[1];
                        navigator.clipboard.writeText(port);
                        setCopiedKind("port");
                        setTimeout(() => setCopiedKind(null), 2500);
                      }}
                      title="Copy just the port number"
                      className="px-2.5 py-1.5 text-xs bg-secondary/80 hover:bg-secondary text-foreground border border-border rounded-lg transition-colors flex items-center gap-1"
                    >
                      {copiedKind === "port" ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span>Port {portalStatus.public_address.split(":")[1]}</span>
                    </button>
                  )}

                  {/* Manual verify reachability probe button */}
                  <button
                    onClick={handleVerifyConnectivity}
                    disabled={isVerifyingPortal}
                    title="Test real TCP socket handshake to verify Minecraft server is publicly reachable"
                    className="px-2.5 py-1.5 text-xs bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {isVerifyingPortal ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{isVerifyingPortal ? "Testing..." : "Verify"}</span>
                  </button>

                  {/* Stop Tunnel Button */}
                  <button
                    onClick={handleStopPortal}
                    disabled={isPortalBusy}
                    className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 border border-border rounded-lg transition-colors"
                  >
                    Stop Tunnel
                  </button>
                </div>
              </div>

              {/* Diagnostics & Info Row */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <span>Local Server: <strong className="text-foreground font-mono">127.0.0.1:{server.port}</strong></span>
                  <span>Provider: <strong className="text-emerald-400 font-mono">Portal Raw TCP</strong></span>
                  {portalStatus.relay_url && (
                    <span>Relay: <strong className="text-foreground font-mono">{portalStatus.relay_url}</strong></span>
                  )}
                  {portalStatus.last_verified_at && (
                    <span>Last Handshake: <strong className="text-foreground">{new Date(portalStatus.last_verified_at * 1000).toLocaleTimeString()}</strong></span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTogglePortalLogs}
                    className="text-muted-foreground hover:text-foreground underline flex items-center gap-1 transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    <span>{showPortalLogs ? "Hide Tunnel Logs" : "View Tunnel Logs"}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (portalStatus?.status as any)?.state === "error" || (portalStatus?.last_error && !portalStatus?.public_address && !portalStatus?.is_running) ? (
            /* CASE 2: Error Stage */
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wide">
                      Portal Tunnel Failed
                    </span>
                    <p className="text-[11px] text-rose-200/90 mt-0.5">
                      {portalStatus?.last_error || (portalStatus?.status as any)?.data?.message || "Failed to start Portal tunnel."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStartPortal}
                    disabled={isPortalBusy}
                    className="px-3 py-1.5 text-xs font-bold bg-rose-500 hover:bg-rose-400 text-background rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                  <button
                    onClick={handleTogglePortalLogs}
                    className="px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                  >
                    Logs
                  </button>
                </div>
              </div>
            </div>
          ) : isPortalBusy || (portalStatus?.status as any)?.state === "starting" || (portalStatus?.status as any)?.state === "connecting" || portalStatus?.is_running ? (
            /* CASE 3: Loading / Connecting */
            <div className="p-3.5 bg-secondary/50 border border-border rounded-xl flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                <div>
                  <span className="text-xs font-bold text-foreground">
                    Connecting to Portal Relay Network...
                  </span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Allocating trustless raw TCP relay port for Minecraft port {server.port}.
                  </p>
                </div>
              </div>
              <button
                onClick={handleStopPortal}
                className="px-2.5 py-1 text-xs text-muted-foreground hover:text-rose-400 border border-border rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* CASE 4: Stopped - One click to start */
            <div className="p-3.5 bg-secondary/30 border border-border rounded-xl flex items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Public Internet Tunnel (Zero Port-Forwarding)
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-semibold">
                      Portal Raw TCP
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Launch a trustless raw TCP tunnel with Portal to give your friends an address to join.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartPortal}
                  disabled={isPortalBusy}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-background font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-background" />
                  <span>Start Public Tunnel</span>
                </button>
                <button
                  type="button"
                  onClick={handleTogglePortalLogs}
                  className="p-1.5 text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                  title="View Portal logs"
                >
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Action notification toast message */}
          {portalNotice && (
            <p
              className={`text-xs mt-2 px-3 py-1.5 rounded-lg border font-medium ${
                portalNotice.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-rose-500/10 text-rose-300 border-rose-500/30"
              }`}
            >
              {portalNotice.text}
            </p>
          )}

          {/* Portal Logs Drawer */}
          {showPortalLogs && (
            <div className="mt-2 p-3 bg-secondary/80 border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" /> Portal Tunnel Logs
                </span>
                <button
                  onClick={async () => {
                    const l = await api.getPortalLogs(server.id);
                    setPortalLogs(l);
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Logs
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto font-mono text-[11px] bg-background p-2.5 rounded-lg border border-border/60 text-muted-foreground space-y-1">
                {portalLogs.length > 0 ? (
                  portalLogs.map((logLine, idx) => (
                    <div key={idx} className="whitespace-pre-wrap leading-tight">
                      {logLine}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground/60 italic">No Portal tunnel logs recorded yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Java Incompatibility Auto-Fix Banner */}
      {javaIssue && (
        <div className="p-4 bg-amber-500/10 border-2 border-amber-500/40 rounded-xl text-amber-200 text-xs space-y-3 shadow-lg shadow-amber-950/20 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0 mt-0.5">
                <Coffee className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                    Java Version Incompatibility Detected
                  </span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                    Java {javaIssue.targetMajor} Required
                  </span>
                  {javaIssue.currentMajor && (
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                      Current: Java {javaIssue.currentMajor}
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-100/90 leading-relaxed max-w-2xl">
                  {javaIssue.reason}
                </p>
                {javaIssue.source && (
                  <p className="font-mono text-[11px] text-amber-200/70 truncate max-w-xl bg-black/40 px-2 py-1 rounded border border-amber-500/20">
                    &gt; {javaIssue.source}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleAutoFixJava(javaIssue.targetMajor)}
                disabled={isFixingJava}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isFixingJava ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    <span>Installing Java {javaIssue.targetMajor}...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-black" />
                    <span>Download Java {javaIssue.targetMajor} &amp; Restart</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar during download/install */}
          {isFixingJava && javaFixProgress && (
            <div className="p-3 bg-black/50 border border-amber-500/30 rounded-lg space-y-2">
              <div className="flex items-center justify-between text-xs text-amber-200">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  {javaFixProgress.step}
                </span>
                <span className="font-mono font-bold text-amber-300">
                  {javaFixProgress.percent.toFixed(1)}%
                  {javaFixProgress.total_bytes > 0 &&
                    ` (${(javaFixProgress.downloaded_bytes / (1024 * 1024)).toFixed(1)} / ${(javaFixProgress.total_bytes / (1024 * 1024)).toFixed(1)} MB)`}
                </span>
              </div>
              <div className="w-full bg-secondary/80 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-amber-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, javaFixProgress.percent))}%` }}
                />
              </div>
            </div>
          )}

          {javaFixError && (
            <p className="text-xs text-rose-300 bg-rose-500/20 border border-rose-500/30 p-2 rounded-lg">
              {javaFixError}
            </p>
          )}
        </div>
      )}

      {/* Failure Diagnostic Alert if server crashed */}
      {isCrashed && !javaIssue && (
        <div className="p-4 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-200 text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Startup Failure Detected: {status?.error_message || "Server process terminated unexpectedly"}</span>
          </div>
          <p className="text-rose-200/90 leading-relaxed">
            {status?.error_message?.includes("Port conflict") && (
              <>
                Another application is already bound to port {server.port}. You can change the port in the{" "}
                <strong className="underline cursor-pointer">Configuration</strong> tab, or close conflicting apps.
              </>
            )}
            {status?.error_message?.includes("Java version") && (
              <>
                The server jar requires a different Java runtime. Open <strong>Settings</strong> to verify installed
                Java runtimes.
              </>
            )}
            {status?.error_message?.includes("Out of Memory") && (
              <>
                The server ran out of allocated memory. Adjust JVM RAM in the server configuration settings.
              </>
            )}
            {!status?.error_message && (
              <>
                Inspect the detailed error stack trace in the console below or ask the AI Technician to analyze it.
              </>
            )}
          </p>
        </div>
      )}

      {/* Console Terminal Window */}
      <div className="flex-1 bg-black/90 border border-border rounded-xl flex flex-col overflow-hidden shadow-inner font-mono text-xs">
        {/* Console Toolbar */}
        <div className="px-4 py-2 bg-secondary/40 border-b border-border/80 flex items-center justify-between gap-4 select-none">
          <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Server Output</span>
            <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-foreground/70">
              {logs.length} lines
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Search filter */}
            <div className="relative flex items-center">
              <Search className="w-3 h-3 absolute left-2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search logs..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-44 bg-secondary/60 border border-border/80 rounded-md pl-7 pr-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
              />
            </div>

            {/* Level filter */}
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as "all" | "errors" | "warnings")}
              className="bg-secondary/60 border border-border/80 rounded-md px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
            >
              <option value="all">All Logs</option>
              <option value="errors">Errors Only</option>
              <option value="warnings">Warnings Only</option>
            </select>

            {/* Auto scroll */}
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer font-sans">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto-scroll
            </label>

            <button
              onClick={handleCopyLogs}
              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
              title="Copy all logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={handleClearLogs}
              className="p-1 text-muted-foreground hover:text-rose-400 rounded hover:bg-secondary transition-colors"
              title="Clear console output"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Log Viewer Lines */}
        <div className="flex-1 p-4 overflow-y-auto space-y-1 font-mono-console leading-relaxed">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground/40 font-sans text-xs">
              {isRunning
                ? "Waiting for server output..."
                : "Server is stopped. Click Start Server above to launch."}
            </div>
          ) : (
            filteredLogs.map((line, idx) => {
              const lower = line.toLowerCase();
              let colorClass = "text-foreground/80";
              if (lower.includes("error") || lower.includes("exception") || lower.includes("fatal")) {
                colorClass = "text-rose-400 font-semibold";
              } else if (lower.includes("warn")) {
                colorClass = "text-amber-300";
              } else if (lower.includes("done (") || lower.includes("success") || lower.includes("ready")) {
                colorClass = "text-emerald-400 font-semibold";
              } else if (lower.includes("info")) {
                colorClass = "text-slate-300";
              }

              return (
                <div key={idx} className={`break-all ${colorClass} hover:bg-white/[0.02] px-1 rounded`}>
                  {line}
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>

        {/* Command Input Bar */}
        <form
          onSubmit={handleSendCommand}
          className="p-2.5 bg-secondary/30 border-t border-border/80 flex items-center gap-2"
        >
          <span className="text-emerald-400 text-xs pl-2 font-bold select-none">&gt;</span>
          <input
            type="text"
            disabled={!isRunning}
            placeholder={
              isRunning
                ? "Enter server command (e.g. op PlayerName, say Hello, help)..."
                : "Server must be running to execute console commands."
            }
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 text-xs focus:outline-none disabled:cursor-not-allowed font-mono-console"
          />
          <button
            type="submit"
            disabled={!isRunning || !command.trim()}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-md transition-all disabled:opacity-40 flex items-center gap-1"
          >
            <Send className="w-3 h-3" /> Send
          </button>
        </form>
      </div>

      <ShareServerModal
        server={server}
        serverStatus={status}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};
