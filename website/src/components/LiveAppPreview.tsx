import React, { useState } from 'react';
import { 
  Terminal, 
  Users, 
  Box, 
  Archive, 
  Maximize2, 
  CheckCircle2, 
  X 
} from 'lucide-react';

interface ShowcaseTab {
  id: 'console' | 'players' | 'plugins' | 'backups';
  label: string;
  icon: React.ReactNode;
  screenshotSrc: string;
  altText: string;
  badge: string;
  headline: string;
  description: string;
  highlights: string[];
}

export const LiveAppPreview: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState<'console' | 'players' | 'plugins' | 'backups'>('console');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const tabs: ShowcaseTab[] = [
    {
      id: 'console',
      label: 'Console & Tunnel',
      icon: <Terminal className="w-4 h-4" />,
      screenshotSrc: './screenshots/console.png',
      altText: 'MCSet Server Console showing Paper 26.3 running, direct connect addresses, and Portal raw TCP tunnel controls',
      badge: 'Live Operations',
      headline: 'Real-Time Console, Direct LAN & Public Tunnels',
      description: 'Stream colorized Minecraft server logs, execute console commands with instant output, and launch a trustless raw TCP tunnel with Portal to host friends without port-forwarding.',
      highlights: [
        'Direct connection IP display for localhost (127.0.0.1) and Local Wi-Fi (192.168.x.x) with 1-click copy',
        'One-click Portal Raw TCP tunnel integration for zero-port-forwarding multiplayer',
        'Real-time output stream with search filter, line counts, and auto-scroll control',
        'Integrated command console for running server commands without leaving the dashboard',
      ],
    },
    {
      id: 'players',
      label: 'Player Management',
      icon: <Users className="w-4 h-4" />,
      screenshotSrc: './screenshots/players.png',
      altText: 'MCSet Player and Access Management interface with Whitelist toggle, Operators, Bans, and UUID sync',
      badge: 'Access Control',
      headline: 'Visual Whitelist, Operators, Bans & Live Kicking',
      description: 'Control server access through an intuitive visual interface without modifying whitelist.json or ops.json manually. Supports Mojang username lookup and UUID resolution.',
      highlights: [
        'One-click Whitelist ON / OFF toggle switch',
        'Categorized tabs for All Players, Whitelist, Operators (levels 1-4), Bans, and Live Kick',
        'Search and filter players by username or UUID',
        'Fast Add Player form with role assignments and instant permission updates',
      ],
    },
    {
      id: 'plugins',
      label: 'Plugins & Modrinth',
      icon: <Box className="w-4 h-4" />,
      screenshotSrc: './screenshots/plugins.png',
      altText: 'MCSet Plugins Manager browsing Modrinth for Paper 26.3 plugins with 1-click install',
      badge: 'Extension Store',
      headline: 'Integrated Modrinth Marketplace & Plugin Manager',
      description: 'Browse, search, and install thousands of verified plugins and loader extensions directly from Modrinth. Filter by downloads or popularity with one-click installation.',
      highlights: [
        'Direct search across Modrinth repository filtered for your server loader and Minecraft version',
        'Sorting options by Most Downloaded, Most Popular (Follows), or Recently Updated',
        '1-click Install button with automated JAR placement in the plugins/ folder',
        'Quick shortcuts for manual plugin upload and opening the server plugins folder in file explorer',
      ],
    },
    {
      id: 'backups',
      label: 'Backup & Recovery',
      icon: <Archive className="w-4 h-4" />,
      screenshotSrc: './screenshots/backups.png',
      altText: 'MCSet Backup and Recovery interface for creating snapshots of world and configs',
      badge: 'Data Protection',
      headline: 'Compressed World & Config Snapshots with 1-Click Restore',
      description: 'Safeguard your entire server world, configs, and extensions before installing heavy mods or updating versions. Create compressed ZIP archives with one click.',
      highlights: [
        '1-click "Create Snapshot" creates timestamped ZIP archives of your world and configs',
        'Zero manual file shuffling when creating backups before testing new mod setups',
        'Fast "Open Folder" button to inspect backup archives directly on disk',
        'Local-first storage: all backups remain on your own computer under your control',
      ],
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Application Overview
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Inside MCSet Desktop
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Explore actual in-app screens demonstrating how MCSet handles server logs, access control, plugin discovery, and world backups.
        </p>
      </div>

      {/* Clean Feature Tabs (Only the 4 working views) */}
      <div className="flex justify-center mb-8">
        <div 
          role="tablist" 
          aria-label="Application views"
          className="inline-flex p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 shadow-lg gap-1.5 overflow-x-auto max-w-full"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTabId === tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTabId === tab.id
                  ? 'bg-emerald-500 text-slate-950 shadow-glow-emerald scale-[1.02]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Showcase Card */}
      <div className="glass-panel rounded-2xl border border-slate-700/80 shadow-2xl bg-slate-950/95 overflow-hidden">
        {/* Real Application Screenshot */}
        <div 
          className="relative group cursor-pointer border-b border-slate-800/80 bg-slate-900 overflow-hidden"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={currentTab.screenshotSrc}
            alt={currentTab.altText}
            width={1024}
            height={700}
            loading="lazy"
            className="w-full h-auto object-cover transform transition-transform duration-300 group-hover:scale-[1.005]"
          />
          <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Click to Expand</span>
          </div>
        </div>

        {/* Feature Explanations Below Screenshot */}
        <div className="p-6 sm:p-8 bg-slate-950">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="md:w-1/2 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {currentTab.badge}
              </span>
              <h3 className="text-xl font-bold text-white pt-1">
                {currentTab.headline}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed pt-1">
                {currentTab.description}
              </p>
            </div>

            <div className="md:w-1/2 space-y-2.5 pt-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Key Capabilities
              </div>
              {currentTab.highlights.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-300 leading-relaxed">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div className="relative max-w-6xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 text-slate-300 text-sm">
              <span className="font-bold text-white">{currentTab.headline}</span>
              <button
                onClick={() => setLightboxOpen(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs flex items-center gap-1"
                aria-label="Close full view"
              >
                <X className="w-3.5 h-3.5" /> Close (Esc)
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-700 shadow-2xl bg-slate-900">
              <img
                src={currentTab.screenshotSrc}
                alt={currentTab.altText}
                width={1024}
                height={700}
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
