import React, { useState, useEffect } from "react";
import {
  Users,
  ShieldCheck,
  ShieldOff,
  Ban,
  UserX,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  UserCheck,
  UserMinus,
  Search,
} from "lucide-react";
import { ServerProfile, ServerStatus, ServerPlayerData } from "../types";
import { api } from "../lib/api";

interface PlayerManagerViewProps {
  server: ServerProfile;
  serverStatus: ServerStatus | null;
}

export const PlayerManagerView: React.FC<PlayerManagerViewProps> = ({
  server,
  serverStatus,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"all" | "whitelist" | "ops" | "bans" | "kick">("all");
  const [playerData, setPlayerData] = useState<ServerPlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Action Modals for pre-filled row actions
  const [banModalTarget, setBanModalTarget] = useState<string | null>(null);
  const [banReasonInput, setBanReasonInput] = useState("");
  const [kickModalTarget, setKickModalTarget] = useState<string | null>(null);
  const [kickReasonInput, setKickReasonInput] = useState("");

  // Deduplicate all lists by player name (lowercase) to ensure 0 duplicates in UI
  const uniqueOps = React.useMemo(() => {
    if (!playerData?.ops) return [];
    const seen = new Set<string>();
    return playerData.ops.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playerData?.ops]);

  const uniqueWhitelist = React.useMemo(() => {
    if (!playerData?.whitelist) return [];
    const seen = new Set<string>();
    return playerData.whitelist.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playerData?.whitelist]);

  const uniqueBannedPlayers = React.useMemo(() => {
    if (!playerData?.banned_players) return [];
    const seen = new Set<string>();
    return playerData.banned_players.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playerData?.banned_players]);

  const uniquePlayers = React.useMemo(() => {
    if (!playerData?.players) return [];
    const seen = new Set<string>();
    return playerData.players.filter((p) => {
      const key = p.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [playerData?.players]);

  // Quick Add Player state
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddAction, setQuickAddAction] = useState<"whitelist" | "op" | "ban">("whitelist");

  // Form states for manual additions
  const [newWhitelistName, setNewWhitelistName] = useState("");
  const [newOpName, setNewOpName] = useState("");
  const [newOpLevel, setNewOpLevel] = useState<number>(4);
  const [newBanName, setNewBanName] = useState("");
  const [newBanReason, setNewBanReason] = useState("");
  const [kickName, setKickName] = useState("");
  const [kickReason, setKickReason] = useState("");

  const isRunning = serverStatus?.state === "running";

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getServerPlayerData(server.id);
      setPlayerData(data);
    } catch (err) {
      setError(`Failed to load player data: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [server.id]);

  const notifySuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 3500);
  };

  const handleToggleWhitelist = async () => {
    if (!playerData) return;
    const targetState = !playerData.whitelist_enabled;
    try {
      await api.toggleServerWhitelist(server.id, targetState);
      setPlayerData({ ...playerData, whitelist_enabled: targetState });
      notifySuccess(`Whitelist ${targetState ? "enabled" : "disabled"} successfully.`);
    } catch (err) {
      setError(`Failed to toggle whitelist: ${String(err)}`);
    }
  };

  const handleAddWhitelist = async (nameToAdd?: string) => {
    const name = (nameToAdd || newWhitelistName).trim();
    if (!name) return;
    try {
      await api.addServerWhitelist(server.id, name);
      if (!nameToAdd) setNewWhitelistName("");
      notifySuccess(`Added ${name} to whitelist.`);
      loadData();
    } catch (err) {
      setError(`Failed to whitelist player: ${String(err)}`);
    }
  };

  const handleRemoveWhitelist = async (name: string) => {
    try {
      await api.removeServerWhitelist(server.id, name);
      notifySuccess(`Removed ${name} from whitelist.`);
      loadData();
    } catch (err) {
      setError(`Failed to remove player: ${String(err)}`);
    }
  };

  const handleAddOp = async (nameToAdd?: string, level = 4) => {
    const name = (nameToAdd || newOpName).trim();
    if (!name) return;
    try {
      await api.addServerOp(server.id, name, level);
      if (!nameToAdd) setNewOpName("");
      notifySuccess(`Promoted ${name} to operator (Level ${level}).`);
      loadData();
    } catch (err) {
      setError(`Failed to add operator: ${String(err)}`);
    }
  };

  const handleRemoveOp = async (name: string) => {
    try {
      await api.removeServerOp(server.id, name);
      notifySuccess(`Removed operator privileges from ${name}.`);
      loadData();
    } catch (err) {
      setError(`Failed to de-op player: ${String(err)}`);
    }
  };

  const handleBanPlayer = async (nameToBan?: string, reason?: string) => {
    const name = (nameToBan || newBanName).trim();
    if (!name) return;
    try {
      await api.banServerPlayer(server.id, name, reason || newBanReason.trim() || undefined);
      if (!nameToBan) {
        setNewBanName("");
        setNewBanReason("");
      }
      setBanModalTarget(null);
      setBanReasonInput("");
      notifySuccess(`Banned ${name} from server.`);
      loadData();
    } catch (err) {
      setError(`Failed to ban player: ${String(err)}`);
    }
  };

  const handleUnbanPlayer = async (name: string) => {
    try {
      await api.unbanServerPlayer(server.id, name);
      notifySuccess(`Unbanned ${name}.`);
      loadData();
    } catch (err) {
      setError(`Failed to unban player: ${String(err)}`);
    }
  };

  const handleKickPlayer = async (nameToKick?: string, reason?: string) => {
    const name = (nameToKick || kickName).trim();
    if (!name) return;
    try {
      await api.kickServerPlayer(server.id, name, reason || kickReason.trim() || undefined);
      if (!nameToKick) {
        setKickName("");
        setKickReason("");
      }
      setKickModalTarget(null);
      setKickReasonInput("");
      notifySuccess(`Kicked ${name} from active session.`);
      loadData();
    } catch (err) {
      setError(`Failed to kick player: ${String(err)}`);
    }
  };

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = quickAddName.trim();
    if (!name) return;

    if (quickAddAction === "whitelist") {
      await handleAddWhitelist(name);
    } else if (quickAddAction === "op") {
      await handleAddOp(name, 4);
    } else if (quickAddAction === "ban") {
      await handleBanPlayer(name);
    }
    setQuickAddName("");
  };

  const allPlayers = uniquePlayers;
  const filteredPlayers = allPlayers.filter(
    (p) =>
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (p.uuid && p.uuid.toLowerCase().includes(searchFilter.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">Player & Access Management</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage all active & inactive players, whitelists, operators, and bans for{" "}
              <span className="text-emerald-400 font-semibold">{server.name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Whitelist Quick Switch */}
          <button
            onClick={handleToggleWhitelist}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-2 ${
              playerData?.whitelist_enabled
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
                : "bg-secondary border-border text-muted-foreground hover:text-foreground"
            }`}
            title="Click to toggle server whitelist on or off"
          >
            {playerData?.whitelist_enabled ? (
              <>
                <ToggleRight className="w-4 h-4 text-emerald-400" /> Whitelist ON
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4 text-muted-foreground" /> Whitelist OFF
              </>
            )}
          </button>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 border border-border rounded-lg transition-colors"
            title="Refresh player lists"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs hover:underline text-rose-400 font-medium">
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Sub Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveSubTab("all")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === "all"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          All Players ({allPlayers.length})
        </button>

        <button
          onClick={() => setActiveSubTab("whitelist")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === "whitelist"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          Whitelist ({uniqueWhitelist.length})
        </button>

        <button
          onClick={() => setActiveSubTab("ops")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === "ops"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Operators ({uniqueOps.length})
        </button>

        <button
          onClick={() => setActiveSubTab("bans")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === "bans"
              ? "bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
          Bans ({(uniqueBannedPlayers.length) + (playerData?.banned_ips.length || 0)})
        </button>

        <button
          onClick={() => setActiveSubTab("kick")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeSubTab === "kick"
              ? "bg-orange-500/15 text-orange-400 border border-orange-500/30 shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          }`}
        >
          <UserX className="w-3.5 h-3.5" />
          Live Kick
        </button>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
        {/* ========================================================= */}
        {/* TAB 1: ALL PLAYERS (ACTIVE & INACTIVE WITH INLINE ACTIONS) */}
        {/* ========================================================= */}
        {activeSubTab === "all" && (
          <div className="space-y-4">
            {/* Quick Add Player / Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card border border-border p-3 rounded-xl shadow-sm">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter players by username or UUID..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-secondary/60 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Add unlisted player */}
              <form onSubmit={handleQuickAdd} className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="New player username..."
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  className="bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 w-full sm:w-44"
                />
                <select
                  value={quickAddAction}
                  onChange={(e) => setQuickAddAction(e.target.value as any)}
                  className="bg-secondary/60 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="whitelist">Whitelist</option>
                  <option value="op">Make OP</option>
                  <option value="ban">Ban</option>
                </select>
                <button
                  type="submit"
                  disabled={!quickAddName.trim()}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center gap-1 shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </form>
            </div>

            {/* Players Table / List */}
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-12 bg-card/40 border border-dashed border-border rounded-xl space-y-2">
                <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">No players found</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchFilter
                    ? "No player matches your search filter."
                    : "No players have joined this server yet, and no players are configured in whitelist or ops."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPlayers.map((player) => (
                  <div
                    key={player.name}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-card border border-border rounded-xl shadow-sm hover:border-border/80 transition-all"
                  >
                    {/* Left: Avatar, Username, Status & Badges */}
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={`https://minotar.net/avatar/${player.name}/40.png`}
                        alt={player.name}
                        className="w-10 h-10 rounded-lg shadow-sm bg-secondary shrink-0 border border-border/80"
                        onError={(e) => {
                          // Fallback to Steve default avatar if minotar is unreachable
                          (e.target as HTMLImageElement).src = "https://minotar.net/avatar/MHF_Steve/40.png";
                        }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-foreground truncate">{player.name}</span>

                          {/* Active / Inactive Badge */}
                          {player.is_online ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active / Online
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-muted-foreground border border-border/60">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                              Inactive / Offline
                            </span>
                          )}

                          {/* OP Badge */}
                          {player.is_op && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-2.5 h-2.5" /> OP Lv.{player.op_level || 4}
                            </span>
                          )}

                          {/* Whitelist Badge */}
                          {player.is_whitelisted && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <UserCheck className="w-2.5 h-2.5" /> Whitelisted
                            </span>
                          )}

                          {/* Banned Badge */}
                          {player.is_banned && (
                            <span
                              className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1"
                              title={player.ban_reason || "Banned"}
                            >
                              <Ban className="w-2.5 h-2.5" /> Banned
                            </span>
                          )}
                        </div>

                        <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                          {player.uuid || "UUID cached via Mojang on connection"}
                        </p>
                      </div>
                    </div>

                    {/* Right: Inline Actions (No typing username needed!) */}
                    <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end flex-wrap pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                      {/* OP / De-OP */}
                      {player.is_op ? (
                        <button
                          onClick={() => handleRemoveOp(player.name)}
                          className="px-2.5 py-1 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Revoke OP privileges from ${player.name}`}
                        >
                          <ShieldOff className="w-3.5 h-3.5 text-amber-400" /> De-OP
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddOp(player.name, 4)}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors flex items-center gap-1"
                          title={`Grant OP privileges to ${player.name}`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" /> Make OP
                        </button>
                      )}

                      {/* Whitelist / Remove Whitelist */}
                      {player.is_whitelisted ? (
                        <button
                          onClick={() => handleRemoveWhitelist(player.name)}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-rose-500/15 text-muted-foreground hover:text-rose-300 border border-border hover:border-rose-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Remove ${player.name} from whitelist`}
                        >
                          <UserMinus className="w-3.5 h-3.5" /> Un-Whitelist
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAddWhitelist(player.name)}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Add ${player.name} to whitelist`}
                        >
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Whitelist
                        </button>
                      )}

                      {/* Ban / Unban */}
                      {player.is_banned ? (
                        <button
                          onClick={() => handleUnbanPlayer(player.name)}
                          className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Pardon / Unban ${player.name}`}
                        >
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setBanModalTarget(player.name);
                            setBanReasonInput("");
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary hover:bg-rose-500/15 text-muted-foreground hover:text-rose-300 border border-border hover:border-rose-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Ban ${player.name}`}
                        >
                          <Ban className="w-3.5 h-3.5 text-rose-400" /> Ban
                        </button>
                      )}

                      {/* Live Kick (if online) */}
                      {player.is_online ? (
                        <button
                          onClick={() => {
                            setKickModalTarget(player.name);
                            setKickReasonInput("");
                          }}
                          className="px-2.5 py-1 text-xs font-semibold bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 rounded-lg transition-colors flex items-center gap-1"
                          title={`Kick ${player.name} from current session`}
                        >
                          <UserX className="w-3.5 h-3.5 text-orange-400" /> Kick
                        </button>
                      ) : (
                        <span
                          className="px-2.5 py-1 text-xs font-normal text-muted-foreground/40 select-none cursor-default"
                          title="Player is currently offline"
                        >
                          Kick (Offline)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: WHITELIST */}
        {/* ========================================================= */}
        {activeSubTab === "whitelist" && (
          <div className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-400" /> Add Player to Whitelist
              </h3>
              <form onSubmit={(e) => { e.preventDefault(); handleAddWhitelist(); }} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Minecraft username (e.g. Steve)"
                  value={newWhitelistName}
                  onChange={(e) => setNewWhitelistName(e.target.value)}
                  className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={!newWhitelistName.trim()}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Whitelist Player
                </button>
              </form>
            </div>

            <div className="space-y-2">
              {(uniqueWhitelist).length === 0 ? (
                <div className="text-center py-8 bg-card/40 border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                  Whitelist is currently empty.
                </div>
              ) : (
                uniqueWhitelist.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://minotar.net/avatar/${p.name}/32.png`}
                        alt={p.name}
                        className="w-8 h-8 rounded-lg bg-secondary shrink-0 border border-border/80"
                      />
                      <div>
                        <span className="text-xs font-bold text-foreground">{p.name}</span>
                        <p className="text-[10px] text-muted-foreground font-mono">{p.uuid || "Pending UUID"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveWhitelist(p.name)}
                      className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Remove from whitelist"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: OPERATORS (OPS) */}
        {/* ========================================================= */}
        {activeSubTab === "ops" && (
          <div className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400" /> Promote Player to Server Operator
              </h3>
              <form onSubmit={(e) => { e.preventDefault(); handleAddOp(); }} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Minecraft username"
                  value={newOpName}
                  onChange={(e) => setNewOpName(e.target.value)}
                  className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                />
                <select
                  value={newOpLevel}
                  onChange={(e) => setNewOpLevel(Number(e.target.value))}
                  className="bg-secondary/60 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  <option value={4}>Level 4 (Full Admin)</option>
                  <option value={3}>Level 3 (Ban / Kick / Op)</option>
                  <option value={2}>Level 2 (Command Blocks)</option>
                  <option value={1}>Level 1 (Bypass Spawn)</option>
                </select>
                <button
                  type="submit"
                  disabled={!newOpName.trim()}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Operator
                </button>
              </form>
            </div>

            <div className="space-y-2">
              {(uniqueOps).length === 0 ? (
                <div className="text-center py-8 bg-card/40 border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                  No operators registered yet.
                </div>
              ) : (
                uniqueOps.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://minotar.net/avatar/${p.name}/32.png`}
                        alt={p.name}
                        className="w-8 h-8 rounded-lg bg-secondary shrink-0 border border-border/80"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{p.name}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Level {p.level || 4}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono">{p.uuid || "UUID cached via Mojang"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveOp(p.name)}
                      className="p-1.5 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title="Revoke operator"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: BANS (PLAYERS & IPS) */}
        {/* ========================================================= */}
        {activeSubTab === "bans" && (
          <div className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <Ban className="w-4 h-4 text-rose-400" /> Ban Player by Name
              </h3>
              <form onSubmit={(e) => { e.preventDefault(); handleBanPlayer(); }} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Minecraft username"
                  value={newBanName}
                  onChange={(e) => setNewBanName(e.target.value)}
                  className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
                />
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={newBanReason}
                  onChange={(e) => setNewBanReason(e.target.value)}
                  className="w-48 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <button
                  type="submit"
                  disabled={!newBanName.trim()}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Ban className="w-3.5 h-3.5" /> Ban Player
                </button>
              </form>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-muted-foreground px-1">Banned Players ({uniqueBannedPlayers.length})</h4>
              {(uniqueBannedPlayers).length === 0 ? (
                <div className="text-center py-6 bg-card/40 border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                  No banned players.
                </div>
              ) : (
                uniqueBannedPlayers.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center justify-between p-3 bg-card border border-border rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={`https://minotar.net/avatar/${p.name}/32.png`}
                        alt={p.name}
                        className="w-8 h-8 rounded-lg bg-secondary shrink-0 border border-border/80"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{p.name}</span>
                          {p.reason && (
                            <span className="text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              {p.reason}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">By: {p.source || "Console"} | Date: {p.created || "Unknown"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnbanPlayer(p.name)}
                      className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg transition-colors"
                    >
                      Pardon / Unban
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Banned IPs */}
            {(playerData?.banned_ips || []).length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-muted-foreground px-1">Banned IP Addresses ({playerData?.banned_ips.length})</h4>
                {playerData?.banned_ips.map((b) => (
                  <div key={b.ip} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
                    <div>
                      <span className="text-xs font-bold font-mono text-foreground">{b.ip}</span>
                      <p className="text-[10px] text-muted-foreground">Reason: {b.reason || "None"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: LIVE KICK */}
        {/* ========================================================= */}
        {activeSubTab === "kick" && (
          <div className="space-y-4">
            <div className="bg-card border border-border p-4 rounded-xl shadow-sm space-y-3">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                <UserX className="w-4 h-4 text-orange-400" /> Kick Connected Player
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Immediately disconnects an active player from the server session with an optional reason message.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleKickPlayer(); }} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Player username"
                  value={kickName}
                  onChange={(e) => setKickName(e.target.value)}
                  className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
                />
                <input
                  type="text"
                  placeholder="Kick reason (e.g. Inactivity)"
                  value={kickReason}
                  onChange={(e) => setKickReason(e.target.value)}
                  className="w-56 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  disabled={!kickName.trim() || !isRunning}
                  className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-40 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <UserX className="w-3.5 h-3.5" /> Kick Player
                </button>
              </form>
              {!isRunning && (
                <p className="text-[11px] text-amber-400/80">
                  Note: The server is currently offline. Kick commands require an active server process.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* QUICK INLINE BAN MODAL */}
      {banModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Ban Player</h3>
                <p className="text-xs text-muted-foreground">
                  Confirm ban for <span className="text-rose-400 font-bold">{banModalTarget}</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Ban Reason (optional)</label>
              <input
                type="text"
                placeholder="e.g. Griefing, Rule violation"
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                autoFocus
                className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBanModalTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleBanPlayer(banModalTarget, banReasonInput)}
                className="px-3.5 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" /> Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK INLINE KICK MODAL */}
      {kickModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Kick Player</h3>
                <p className="text-xs text-muted-foreground">
                  Disconnect <span className="text-orange-400 font-bold">{kickModalTarget}</span> from server
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Kick Reason (optional)</label>
              <input
                type="text"
                placeholder="e.g. AFK, Inactivity, Admin request"
                value={kickReasonInput}
                onChange={(e) => setKickReasonInput(e.target.value)}
                autoFocus
                className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-orange-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setKickModalTarget(null)}
                className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleKickPlayer(kickModalTarget, kickReasonInput)}
                className="px-3.5 py-1.5 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" /> Kick Player
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

