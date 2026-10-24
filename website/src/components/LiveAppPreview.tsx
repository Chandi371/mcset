import React, { useState } from 'react';
import { 
  Server, 
  Terminal, 
  Box, 
  Sparkles, 
  Play, 
  Square, 
  RotateCw, 
  Wifi, 
  Cpu, 
  HardDrive, 
  Users, 
  Download, 
  ShieldCheck, 
  Search
} from 'lucide-react';

export const LiveAppPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mods' | 'console' | 'ai'>('dashboard');
  const [isRunning, setIsRunning] = useState(true);
  const [consoleInput, setConsoleInput] = useState('');
  const [consoleLogs, setConsoleLogs] = useState([
    '[14:22:01 INFO]: Preparing start region for dimension minecraft:overworld',
    '[14:22:03 INFO]: Time elapsed: 1824 ms',
    '[14:22:03 INFO]: [PortalTunnel] Public tunnel initialized: mc-friends.portal.sh:25565',
    '[14:22:04 INFO]: Done (4.120s)! For help, type "help"',
    '[14:22:15 INFO]: Player "Steve" joined the game (127.0.0.1:54322)',
    '[14:22:18 INFO]: Player "Alex" connected via tunnel (portal-client:60114)',
  ]);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    setConsoleLogs((prev) => [
      ...prev,
      `[14:23:00 USER]: ${consoleInput}`,
      `[14:23:00 INFO]: Executed command: "${consoleInput}" successfully.`,
    ]);
    setConsoleInput('');
  };

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
          Experience MCSet in Action
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-400">
          Click around the interactive interface below to see how easy Minecraft server management really is.
        </p>
      </div>

      {/* Main Mockup Container */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl bg-slate-950/90 max-w-5xl mx-auto">
        {/* Window Title Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              MCSet Desktop v0.1.0 — Paper 1.21.4 (Running)
            </span>
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button
              onClick={() => setActiveTab('mods')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'mods'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Mods & Modpacks</span>
            </button>
            <button
              onClick={() => setActiveTab('console')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'console'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Console</span>
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-3 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'ai'
                  ? 'bg-purple-500 text-white shadow-sm'
                  : 'text-purple-300 hover:text-purple-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI Diagnostics</span>
            </button>
          </div>
        </div>

        {/* Mock Window Content */}
        <div className="p-5 sm:p-6 min-h-[420px] bg-slate-950">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Server Hero Banner Card */}
              <div className="p-5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <Server className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">Friends SMP Realm</h3>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1 ${
                        isRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`} />
                        {isRunning ? 'RUNNING' : 'STOPPED'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Paper 1.21.4 • Java 21 (Temurin Isolated) • 4GB RAM Allocated
                    </p>
                  </div>
                </div>

                {/* Server Control Buttons */}
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsRunning(!isRunning)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      isRunning
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    }`}
                  >
                    {isRunning ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    {isRunning ? 'Stop Server' : 'Start Server'}
                  </button>
                  <button
                    onClick={() => {
                      setIsRunning(false);
                      setTimeout(() => setIsRunning(true), 600);
                    }}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs flex items-center gap-1"
                    title="Restart"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Performance</span>
                    <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-2">20.0 TPS</div>
                  <div className="text-[11px] text-emerald-400 mt-0.5">MSPT: 12.4ms (Optimal)</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Memory</span>
                    <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-2">1.82 GB</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Allocated 4.00 GB (45%)</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Players</span>
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="text-xl font-bold text-white mt-2">2 / 20</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Steve, Alex online</div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Zero-Port Tunnel</span>
                    <Wifi className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="text-xl font-bold text-purple-400 mt-2 flex items-center gap-1.5">
                    Active
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                    mc-friends.portal.sh
                  </div>
                </div>
              </div>

              {/* Instant Shareable Tunnel Box */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                      Public Player Join Address (No Port Forwarding)
                    </h4>
                    <p className="text-sm font-mono text-white select-all">
                      mc-friends.portal.sh:25565
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  Give this address to any friend on PC or Mac to join immediately!
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MODS & MODPACKS */}
          {activeTab === 'mods' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    readOnly
                    value="optimization & performance mods"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/20">
                  Modrinth & CurseForge API
                </span>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    name: 'Lithium',
                    author: 'jellysquid3_',
                    desc: 'General-purpose optimization mod for Fabric/Paper servers.',
                    downloads: '14.2M',
                    installed: true,
                  },
                  {
                    name: 'FerriteCore',
                    author: 'malte0811',
                    desc: 'Memory usage optimizations reducing heap memory up to 50%.',
                    downloads: '9.8M',
                    installed: true,
                  },
                  {
                    name: 'Simple Voice Chat',
                    author: 'henkelmax',
                    desc: 'Proximity voice chat in Minecraft with low latency UDP audio.',
                    downloads: '18.1M',
                    installed: false,
                  },
                  {
                    name: 'Chunky',
                    author: 'pop4959',
                    desc: 'Pre-generates chunks rapidly to eliminate exploration lag.',
                    downloads: '4.6M',
                    installed: false,
                  },
                ].map((mod, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{mod.name}</span>
                        <span className="text-[10px] text-slate-400">by {mod.author}</span>
                        <span className="text-[10px] text-slate-500">• {mod.downloads} downloads</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{mod.desc}</p>
                    </div>

                    <button
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                        mod.installed
                          ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                      {mod.installed ? 'Installed' : 'Install'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CONSOLE & RCON */}
          {activeTab === 'console' && (
            <div className="flex flex-col h-[340px] font-mono text-xs">
              <div className="flex-1 overflow-y-auto p-4 rounded-t-xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-slate-300">
                {consoleLogs.map((log, i) => (
                  <div key={i} className={log.includes('USER') ? 'text-cyan-400 font-bold' : log.includes('PortalTunnel') ? 'text-purple-400 font-semibold' : ''}>
                    {log}
                  </div>
                ))}
              </div>
              <form onSubmit={handleCommandSubmit} className="flex items-center border border-t-0 border-slate-800 rounded-b-xl overflow-hidden bg-slate-900">
                <span className="px-3 text-slate-500 font-bold">&gt;</span>
                <input
                  type="text"
                  value={consoleInput}
                  onChange={(e) => setConsoleInput(e.target.value)}
                  placeholder="Type a server command (e.g. /gamemode creative, /say hi, /tps)..."
                  className="flex-1 bg-transparent py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none"
                />
                <button type="submit" className="px-4 py-2.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 font-semibold text-xs border-l border-slate-800">
                  Send
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: AI DIAGNOSTICS */}
          {activeTab === 'ai' && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-purple-500/30 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/40">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-300">MCSet AI Agent (MCP Engine)</span>
                    <span className="text-[10px] text-slate-500">Analysis completed in 320ms</span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2">
                    <p>
                      <strong>Diagnostic Report:</strong> I scanned the last 15 minutes of server tick rates. TPS dropped from 20.0 to 14.2 due to <span className="text-amber-400 font-medium">entity cramming</span> in chunk <code className="text-purple-300">(-14, 22)</code> where 412 chickens are confined.
                    </p>
                    <p className="text-slate-400">
                      <strong>Recommended Fix:</strong> Adjust <code className="text-slate-200">max-entity-cramming=24</code> in <code className="text-slate-200">server.properties</code> and despawn excess entities without restarting the server.
                    </p>
                  </div>

                  {/* Cryptographic Action Authorization Banner */}
                  <div className="mt-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs text-slate-200">
                        Cryptographic Token Ready: <code className="text-emerald-400 text-[10px]">AUTH-0x8F92A1</code>
                      </span>
                    </div>
                    <button className="px-3 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors">
                      Authorize & Apply Fix
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
