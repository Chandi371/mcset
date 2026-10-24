import React, { useState } from 'react';
import { 
  Server, 
  Terminal, 
  Users, 
  Globe2, 
  Folder, 
  Wifi, 
  Sliders, 
  Box, 
  Archive, 
  Bot, 
  Settings, 
  Play, 
  Square, 
  RotateCw, 
  Copy, 
  Check, 
  Search, 
  Plus, 
  RefreshCw, 
  Download, 
  Trash2, 
  ChevronDown
} from 'lucide-react';

interface PluginItem {
  id: string;
  name: string;
  author: string;
  desc: string;
  tags: string[];
  downloads: string;
  iconBg: string;
  iconText: string;
  installed: boolean;
}

export const LiveAppPreview: React.FC = () => {
  // Sidebar navigation state
  const [currentView, setCurrentView] = useState<'console' | 'players' | 'plugins' | 'backups' | 'tunnel'>('console');

  // Console State
  const [isRunning, setIsRunning] = useState(true);
  const [tunnelActive, setTunnelActive] = useState(false);
  const [copiedThisPc, setCopiedThisPc] = useState(false);
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [copiedTunnel, setCopiedTunnel] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [logs, setLogs] = useState<string[]>([
    '[08:51:19 INFO]: Preparing spawn area: 100%',
    '[08:51:19 INFO]: Prepared spawn area in 213 ms',
    '[08:51:19 INFO]: Done preparing level "world" (5.132s)',
    '[08:51:20 INFO]: [spark] Starting background profiler...',
    '[08:51:20 INFO]: [spark] The async-profiler engine is not supported for your os/arch, built-in Java engine will be used.',
    '[08:51:20 INFO]: Saving chunks for level \'ServerLevel[world]\'/minecraft:overworld',
    '[08:51:20 INFO]: Saving chunks for level \'ServerLevel[world]\'/minecraft:the_nether',
    '[08:51:20 INFO]: Saving chunks for level \'ServerLevel[world]\'/minecraft:the_end',
    '[08:51:21 INFO]: Running delayed init tasks',
    '[08:51:21 INFO]: Done (22.044s)! For help, type "help"',
    '[08:51:21 INFO]: ******************************************************************',
    '[08:51:21 INFO]: This is the first time you\'re starting this server.',
    '[08:51:21 INFO]: View this and more helpful information here: https://docs.papermc.io/paper/next-steps',
    '[08:51:21 INFO]: ******************************************************************',
  ]);

  // Players State
  const [whitelistOn, setWhitelistOn] = useState(true);
  const [playerTab, setPlayerTab] = useState<'all' | 'whitelist' | 'ops' | 'bans'>('all');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [playersList, setPlayersList] = useState<{ name: string; role: string; online: boolean }[]>([
    { name: 'Steve', role: 'Operator (Level 4)', online: true },
    { name: 'Alex', role: 'Member', online: false },
  ]);

  // Plugins State
  const [pluginFilter, setPluginFilter] = useState<'downloads' | 'popular' | 'updated'>('downloads');
  const [plugins, setPlugins] = useState<PluginItem[]>([
    {
      id: 'veinminer',
      name: 'VeinMiner',
      author: 'Miraculixx',
      desc: 'Mine the whole vein on mining a single ore/block. Make the tedious mining experience into something satisfying and fun! FTB Ultimine alternative.',
      tags: ['BUKKIT', 'CURSED', 'DATAPACK', 'EQUIPMENT'],
      downloads: '10,13,66,821',
      iconBg: 'bg-amber-600',
      iconText: '⛏️',
      installed: false,
    },
    {
      id: 'voicechat',
      name: 'Simple Voice Chat',
      author: 'henkelmax',
      desc: 'A working voice chat in Minecraft! Supports proximity chat, group chats, and positional audio.',
      tags: ['ADVENTURE', 'BUKKIT', 'BUNGEECORD', 'FABRIC'],
      downloads: '7,67,18,175',
      iconBg: 'bg-slate-700',
      iconText: '🎙️',
      installed: true,
    },
    {
      id: 'despawn',
      name: 'Let Me Despawn',
      author: 'frikinjay',
      desc: 'Improves performance by tweaking mob despawn rules. Say bye to pesky unintentional persistent mobs.',
      tags: ['BUKKIT', 'FABRIC', 'FORGE'],
      downloads: '2,55,78,310',
      iconBg: 'bg-emerald-800',
      iconText: '🧟',
      installed: false,
    },
    {
      id: 'chunky',
      name: 'Chunky',
      author: 'pop4959',
      desc: 'Pre-generates chunks, quickly and efficiently to prevent server lag when players explore new areas.',
      tags: ['BUKKIT', 'FABRIC', 'FORGE'],
      downloads: '2,01,69,870',
      iconBg: 'bg-indigo-700',
      iconText: '⭐',
      installed: false,
    },
  ]);

  // Backups State
  const [backups, setBackups] = useState<{ id: string; name: string; size: string; date: string }[]>([
    { id: '1', name: 'pre-update-paper-26.3.zip', size: '42.8 MB', date: 'Today at 08:30 AM' },
  ]);

  // Handlers
  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;
    setLogs((prev) => [
      ...prev,
      `> ${commandInput}`,
      `[INFO]: Command "${commandInput}" executed successfully.`,
    ]);
    setCommandInput('');
  };

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    setPlayersList((prev) => [...prev, { name: newPlayerName.trim(), role: 'Whitelisted', online: false }]);
    setNewPlayerName('');
  };

  const toggleInstallPlugin = (id: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === id ? { ...p, installed: !p.installed } : p))
    );
  };

  const createSnapshot = () => {
    const newBackup = {
      id: String(Date.now()),
      name: `backup-${new Date().toLocaleDateString().replace(/\//g, '-')}-${Math.floor(Math.random() * 900 + 100)}.zip`,
      size: `${(Math.random() * 20 + 35).toFixed(1)} MB`,
      date: 'Just now',
    };
    setBackups((prev) => [newBackup, ...prev]);
  };

  const copyText = (text: string, type: 'thispc' | 'wifi' | 'tunnel') => {
    navigator.clipboard?.writeText(text);
    if (type === 'thispc') {
      setCopiedThisPc(true);
      setTimeout(() => setCopiedThisPc(false), 2000);
    } else if (type === 'wifi') {
      setCopiedWifi(true);
      setTimeout(() => setCopiedWifi(false), 2000);
    } else {
      setCopiedTunnel(true);
      setTimeout(() => setCopiedTunnel(false), 2000);
    }
  };

  return (
    <section className="py-16 px-2 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Interactive Live Application UI
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Experience MCSet Right in Your Browser
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Click around the sidebar items, start tunnels, install plugins, and issue commands on the exact real MCSet interface.
        </p>
      </div>

      {/* Main MCSet Window Simulator */}
      <div className="rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl bg-[#090d16] max-w-6xl mx-auto font-sans text-slate-200 text-xs select-none">
        {/* Titlebar */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#060a12] border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-[10px] text-emerald-400 font-black">
              MC
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              MCSet - Minecraft Server Management Platform
            </span>
          </div>
          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <span>FPS: 60</span>
            <div className="flex items-center space-x-1.5 ml-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-slate-600 inline-block cursor-pointer" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-700 hover:bg-slate-600 inline-block cursor-pointer" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 hover:bg-red-500 inline-block cursor-pointer" />
            </div>
          </div>
        </div>

        {/* Window Body: Sidebar + Main Content */}
        <div className="flex flex-col md:flex-row min-h-[580px]">
          {/* ================= LEFT SIDEBAR ================= */}
          <aside className="w-full md:w-56 bg-[#0a0f1d] border-r border-slate-800/80 p-3 flex flex-col justify-between shrink-0">
            <div className="space-y-4">
              {/* App Brand Header */}
              <div className="flex items-center gap-2.5 px-1 py-1">
                <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-xs shadow-glow-emerald">
                  MC
                </div>
                <div>
                  <div className="font-bold text-white text-xs flex items-center gap-1.5">
                    MCSet
                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      v0.1
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500">Server Management</div>
                </div>
              </div>

              {/* Active Server Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 px-1">
                  <span>Active Server</span>
                  <button className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5">
                    <Plus className="w-3 h-3" /> New
                  </button>
                </div>
                <div className="p-2 rounded-lg bg-[#0e1628] border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                    <div>
                      <div className="font-bold text-white text-xs">test</div>
                      <div className="text-[9px] font-mono text-cyan-400">PAPER 26.3</div>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </div>
                {/* Port & Stop Quick Action */}
                <div className="flex items-center justify-between px-1 text-[10px]">
                  <span className="text-slate-400 font-mono flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    Port :25565
                  </span>
                  <button
                    onClick={() => setIsRunning(!isRunning)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                      isRunning
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isRunning ? <Square className="w-2.5 h-2.5 fill-current" /> : <Play className="w-2.5 h-2.5 fill-current" />}
                    {isRunning ? 'Stop' : 'Start'}
                  </button>
                </div>
              </div>

              {/* Navigation Menu */}
              <nav className="space-y-0.5 pt-2 border-t border-slate-800/60">
                {[
                  { id: 'servers', label: 'Servers', icon: <Server className="w-3.5 h-3.5" /> },
                  { id: 'console', label: 'Console & Logs', icon: <Terminal className="w-3.5 h-3.5" /> },
                  { id: 'players', label: 'Players', icon: <Users className="w-3.5 h-3.5" /> },
                  { id: 'worlds', label: 'Worlds & Dimensions', icon: <Globe2 className="w-3.5 h-3.5" /> },
                  { id: 'explorer', label: 'File Explorer', icon: <Folder className="w-3.5 h-3.5" /> },
                  { id: 'tunnel', label: 'Public Tunnel', icon: <Wifi className="w-3.5 h-3.5" /> },
                  { id: 'config', label: 'Configuration', icon: <Sliders className="w-3.5 h-3.5" /> },
                  { id: 'plugins', label: 'Mods & Plugins', icon: <Box className="w-3.5 h-3.5" /> },
                  { id: 'backups', label: 'Backups', icon: <Archive className="w-3.5 h-3.5" /> },
                  { id: 'ai', label: 'AI Technician', icon: <Bot className="w-3.5 h-3.5" /> },
                  { id: 'settings', label: 'Settings', icon: <Settings className="w-3.5 h-3.5" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (['console', 'players', 'plugins', 'backups', 'tunnel'].includes(item.id)) {
                        setCurrentView(item.id as any);
                      } else {
                        setCurrentView('console');
                      }
                    }}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-all ${
                      currentView === item.id
                        ? 'bg-[#0f2420] text-emerald-400 border-l-2 border-emerald-400'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* ================= MAIN CONTENT VIEW ================= */}
          <main className="flex-1 bg-[#090e1a] p-4 sm:p-5 overflow-y-auto">
            {/* VIEW 1: CONSOLE & LOGS */}
            {currentView === 'console' && (
              <div className="space-y-4">
                {/* Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">test Console</h2>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 ${
                        isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
                        {isRunning ? 'running' : 'stopped'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-xl">
                      PAPER 26.3 • Port 25565 • Directory: C:\Users\hanis\AppData\Roaming\mcset\servers\test_b397ffe7
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setLogs((prev) => [...prev, '[INFO]: Restarting server process...']);
                        setIsRunning(false);
                        setTimeout(() => setIsRunning(true), 800);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5 border border-slate-700"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Restart
                    </button>
                    <button
                      onClick={() => setIsRunning(!isRunning)}
                      className="px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-white font-bold flex items-center gap-1.5"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      {isRunning ? 'Stop Server' : 'Start Server'}
                    </button>
                  </div>
                </div>

                {/* Direct Connection Card */}
                <div className="p-3.5 rounded-xl bg-[#0c1424] border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Wifi className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">CONNECT DIRECTLY</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">Port 25565</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        In Minecraft &gt; Multiplayer &gt; Direct Connection
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-[#070b14] border border-slate-800 rounded-lg overflow-hidden text-[11px] font-mono">
                      <span className="px-2 py-1 bg-slate-900 text-slate-400 text-[10px]">THIS PC</span>
                      <span className="px-2.5 py-1 text-emerald-400">127.0.0.1:25565</span>
                      <button
                        onClick={() => copyText('127.0.0.1:25565', 'thispc')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Copy Address"
                      >
                        {copiedThisPc ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center bg-[#070b14] border border-slate-800 rounded-lg overflow-hidden text-[11px] font-mono">
                      <span className="px-2 py-1 bg-slate-900 text-slate-400 text-[10px]">SAME WI-FI</span>
                      <span className="px-2.5 py-1 text-cyan-300">192.168.1.9:25565</span>
                      <button
                        onClick={() => copyText('192.168.1.9:25565', 'wifi')}
                        className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Copy Address"
                      >
                        {copiedWifi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Public Internet Tunnel Card (Portal Raw TCP) */}
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#141226] via-[#0d162a] to-[#0c1424] border border-purple-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-glow-purple">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                      <Globe2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">Public Internet Tunnel (Zero Port-Forwarding)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">Portal Raw TCP</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Launch a trustless raw TCP tunnel with Portal to give your friends an address to join.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {tunnelActive && (
                      <div className="flex items-center bg-[#070b14] border border-purple-500/40 rounded-lg px-2.5 py-1 font-mono text-[11px] text-purple-300">
                        <span>portal.sh:25565</span>
                        <button
                          onClick={() => copyText('portal.sh:25565', 'tunnel')}
                          className="ml-2 text-slate-400 hover:text-white"
                        >
                          {copiedTunnel ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => setTunnelActive(!tunnelActive)}
                      className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        tunnelActive
                          ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40 hover:bg-purple-800'
                          : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-glow-emerald'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      {tunnelActive ? 'Stop Public Tunnel' : 'Start Public Tunnel'}
                    </button>
                  </div>
                </div>

                {/* Server Output Terminal */}
                <div className="rounded-xl border border-slate-800 bg-[#070b14] overflow-hidden flex flex-col">
                  {/* Console Controls Bar */}
                  <div className="px-3 py-2 bg-[#0a0f1d] border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono text-emerald-400">&gt; Server Output ({logs.length} lines)</span>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          placeholder="Search logs..."
                          className="bg-[#0e1628] pl-6 pr-2 py-0.5 rounded text-[10px] text-slate-300 border border-slate-700/60 focus:outline-none"
                        />
                      </div>
                      <span className="text-slate-500">All Logs</span>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded bg-slate-800 text-emerald-400 text-xs" />
                        <span>Auto-scroll</span>
                      </label>
                      <button onClick={() => setLogs([])} className="hover:text-red-400" title="Clear console">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Terminal Text Area */}
                  <div className="p-3.5 font-mono text-[11px] h-52 overflow-y-auto space-y-1 text-slate-300">
                    {logs.map((log, i) => (
                      <div
                        key={i}
                        className={
                          log.includes('Done')
                            ? 'text-emerald-400 font-bold'
                            : log.includes('Command')
                            ? 'text-cyan-400'
                            : log.includes('spark')
                            ? 'text-amber-300'
                            : log.includes('***')
                            ? 'text-slate-500'
                            : 'text-slate-300'
                        }
                      >
                        {log}
                      </div>
                    ))}
                  </div>

                  {/* Terminal Command Input */}
                  <form onSubmit={handleCommand} className="flex items-center border-t border-slate-800 bg-[#0a0f1d]">
                    <span className="px-3 text-slate-500 font-mono font-bold">&gt;</span>
                    <input
                      type="text"
                      value={commandInput}
                      onChange={(e) => setCommandInput(e.target.value)}
                      placeholder="Enter server command (e.g. op PlayerName, say Hello, help)..."
                      className="flex-1 bg-transparent py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none font-mono"
                    />
                    <button type="submit" className="px-4 py-2 bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400">
                      Send
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* VIEW 2: PLAYERS & ACCESS MANAGEMENT */}
            {currentView === 'players' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white">Player &amp; Access Management</h2>
                    <p className="text-[10px] text-slate-400">
                      Manage all active &amp; inactive players, whitelists, operators, and bans for test
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setWhitelistOn(!whitelistOn)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        whitelistOn
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      Whitelist {whitelistOn ? 'ON' : 'OFF'}
                    </button>
                    <button className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1.5 border-b border-slate-800/80 pb-2">
                  {[
                    { id: 'all', label: `All Players (${playersList.length})` },
                    { id: 'whitelist', label: 'Whitelist (1)' },
                    { id: 'ops', label: 'Operators (1)' },
                    { id: 'bans', label: 'Bans (0)' },
                    { id: 'kick', label: 'Live Kick' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setPlayerTab(tab.id as any)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        playerTab === tab.id
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search & Add Player Bar */}
                <form onSubmit={handleAddPlayer} className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter players by username or UUID..."
                      className="w-full bg-[#0c1424] pl-9 pr-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder="New player username..."
                      className="bg-[#0c1424] px-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-200 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                </form>

                {/* Players List Table */}
                <div className="rounded-xl border border-slate-800 bg-[#0c1424] overflow-hidden">
                  <div className="divide-y divide-slate-800/80">
                    {playersList.map((player, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-900/40">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center font-bold text-emerald-400 border border-slate-700">
                            {player.name[0]}
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs flex items-center gap-2">
                              <span>{player.name}</span>
                              <span className={`w-1.5 h-1.5 rounded-full ${player.online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                            </div>
                            <div className="text-[10px] text-slate-400">{player.role}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]">
                            Promote Op
                          </button>
                          <button
                            onClick={() => setPlayersList((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-[10px]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 3: PLUGINS MANAGER */}
            {currentView === 'plugins' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white">Plugins Manager</h2>
                    <p className="text-[10px] text-slate-400">
                      Manage installed extensions or discover verified projects on Modrinth
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold text-xs flex items-center gap-1.5">
                      <Plus className="w-3.5 h-3.5" /> Upload Plugin
                    </button>
                    <button className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5" /> Open Folder
                    </button>
                  </div>
                </div>

                {/* Modrinth Search Bar */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      readOnly
                      value="Search or browse Modrinth for paper 26.3 plugins..."
                      className="w-full bg-[#0c1424] pl-9 pr-3 py-2 rounded-lg border border-slate-800 text-xs text-slate-300 focus:outline-none"
                    />
                  </div>
                  <button className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg">
                    Search
                  </button>
                </div>

                {/* Sort Filters & Count */}
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <span>Sort By:</span>
                    <button
                      onClick={() => setPluginFilter('downloads')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        pluginFilter === 'downloads'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Most Downloaded
                    </button>
                    <button
                      onClick={() => setPluginFilter('popular')}
                      className={`px-2.5 py-1 rounded-md text-[11px] ${
                        pluginFilter === 'popular'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Most Popular (Follows)
                    </button>
                    <button
                      onClick={() => setPluginFilter('updated')}
                      className={`px-2.5 py-1 rounded-md text-[11px] ${
                        pluginFilter === 'updated'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Recently Updated
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500">20 projects found</span>
                </div>

                {/* Plugin Cards List */}
                <div className="space-y-2.5">
                  {plugins.map((plugin) => (
                    <div
                      key={plugin.id}
                      className="p-3 rounded-xl bg-[#0c1424] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg ${plugin.iconBg} flex items-center justify-center text-lg shrink-0 shadow-md`}>
                          {plugin.iconText}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{plugin.name}</span>
                            <span className="text-[10px] text-slate-500">by {plugin.author}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5 max-w-xl leading-relaxed">
                            {plugin.desc}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {plugin.tags.map((tag, tIdx) => (
                              <span key={tIdx} className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                {tag}
                              </span>
                            ))}
                            <span className="text-[9px] text-slate-500 ml-1">
                              {plugin.downloads} downloads
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleInstallPlugin(plugin.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 ${
                          plugin.installed
                            ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-glow-emerald'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {plugin.installed ? 'Installed' : 'Install'}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                  <span>Showing 1-20 of 2,609 results</span>
                  <div className="flex items-center gap-2">
                    <button className="px-2 py-1 rounded bg-slate-800 text-slate-400">&lt; Previous</button>
                    <span className="text-white font-bold">Page 1 of 131</span>
                    <button className="px-2 py-1 rounded bg-slate-800 text-slate-200">Next &gt;</button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 4: BACKUPS & RECOVERY */}
            {currentView === 'backups' && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white">Backup &amp; Recovery</h2>
                    <p className="text-[10px] text-slate-400">
                      Safeguard your server world, configs, and extensions with compressed snapshots
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5" /> Open Folder
                    </button>
                    <button
                      onClick={createSnapshot}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-glow-emerald"
                    >
                      <Plus className="w-3.5 h-3.5" /> Create Snapshot
                    </button>
                  </div>
                </div>

                {/* Backups List */}
                <div className="p-4 rounded-xl bg-[#0c1424] border border-slate-800">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <span className="font-bold text-white flex items-center gap-2">
                      <Archive className="w-4 h-4 text-emerald-400" />
                      Existing Backups for test ({backups.length})
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">Saved inside backups/</span>
                  </div>

                  <div className="divide-y divide-slate-800/60">
                    {backups.map((b) => (
                      <div key={b.id} className="py-2.5 flex items-center justify-between">
                        <div>
                          <div className="font-mono text-xs font-bold text-slate-200">{b.name}</div>
                          <div className="text-[10px] text-slate-500">{b.date} • {b.size}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-[10px] font-bold">
                            Restore
                          </button>
                          <button
                            onClick={() => setBackups((prev) => prev.filter((item) => item.id !== b.id))}
                            className="p-1 rounded text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 5: PUBLIC TUNNEL */}
            {currentView === 'tunnel' && (
              <div className="space-y-4">
                <div className="pb-3 border-b border-slate-800/80">
                  <h2 className="text-base font-bold text-white">Public Tunnel Management</h2>
                  <p className="text-[10px] text-slate-400">
                    Zero-port-forwarding raw TCP tunnels using verified Portal binaries
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0c1424] border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300">Tunnel Daemon Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      tunnelActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tunnelActive ? 'Connected' : 'Idle'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Portal multiplexes outgoing TCP packets through high-speed edge relays. Players join using the public URL with zero configuration on their side.
                  </p>
                  <button
                    onClick={() => setTunnelActive(!tunnelActive)}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                  >
                    {tunnelActive ? 'Disconnect Tunnel' : 'Connect Public Relay'}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </section>
  );
};
