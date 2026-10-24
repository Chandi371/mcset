import React, { useState } from 'react';
import { 
  Terminal, 
  Box, 
  Users, 
  Archive, 
  Maximize2, 
  CheckCircle2 
} from 'lucide-react';

interface ScreenshotTab {
  id: 'console' | 'plugins' | 'players' | 'backups';
  title: string;
  icon: React.ReactNode;
  imageSrc: string;
  alt: string;
  headline: string;
  description: string;
  features: string[];
}

export const LiveAppPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'console' | 'plugins' | 'players' | 'backups'>('console');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const tabs: ScreenshotTab[] = [
    {
      id: 'console',
      title: 'Console & Tunnel',
      icon: <Terminal className="w-4 h-4" />,
      imageSrc: './screenshots/console.png',
      alt: 'MCSet Server Console and Zero-Port-Forwarding Public Tunnel',
      headline: 'Real-Time Console, Direct Connection & Public Tunnels',
      description: 'Stream server logs with syntax coloring, execute commands with autocomplete, and spin up a trustless raw TCP public tunnel in 1-click without opening router ports.',
      features: [
        'Live colorized server output log with auto-scroll and quick pause',
        'Direct LAN connection and Same Wi-Fi join address copying',
        'Zero-Port-Forwarding Portal tunnel with 1-click activation',
        'Instant server start, graceful stop, and fast restart controls',
      ],
    },
    {
      id: 'plugins',
      title: 'Plugins & Modrinth',
      icon: <Box className="w-4 h-4" />,
      imageSrc: './screenshots/plugins.png',
      alt: 'MCSet Plugins Manager with Modrinth search and 1-click install',
      headline: 'Integrated Modrinth Marketplace & Plugin Manager',
      description: 'Browse, filter, and install thousands of verified plugins and mods directly from Modrinth. MCSet handles downloading, compatibility checks, and file placement automatically.',
      features: [
        'Search thousands of Bukkit, Spigot, Paper, Fabric, and Forge extensions',
        'Filter by Most Downloaded, Most Popular, or Recently Updated',
        '1-click direct installation with instant status feedback',
        'Built-in "Upload Plugin" and "Open Folder" quick shortcuts',
      ],
    },
    {
      id: 'players',
      title: 'Player & Access Control',
      icon: <Users className="w-4 h-4" />,
      imageSrc: './screenshots/players.png',
      alt: 'MCSet Player and Access Management interface',
      headline: 'Visual Whitelist, Operators, Bans & Live Kicking',
      description: 'Manage who can enter your realm with zero manual JSON editing. Synchronize Mojang UUIDs, toggle whitelists on the fly, and inspect active players.',
      features: [
        'Instant Whitelist ON/OFF toggle switch',
        'Visual tabs for All Players, Whitelist, Operators (levels 1-4), and Bans',
        'Live player search by username or Mojang UUID',
        'One-click Add to Whitelist and Live Kick capabilities',
      ],
    },
    {
      id: 'backups',
      title: 'Backups & Recovery',
      icon: <Archive className="w-4 h-4" />,
      imageSrc: './screenshots/backups.png',
      alt: 'MCSet Backup and Recovery snapshot manager',
      headline: 'Compressed Snapshots & 1-Click Restoration',
      description: 'Safeguard your entire server world, configs, and plugins with compressed snapshots before installing heavy mods or updating versions.',
      features: [
        '1-click "Create Snapshot" creates isolated compressed archives',
        'Complete world, dimensions, server.properties, and plugin state saved',
        'Fast "Open Folder" access to all local backup ZIPs',
        'Instant restore to roll back griefing or corrupted world chunks',
      ],
    },
  ];

  const currentTab = tabs.find((t) => t.id === activeTab) || tabs[0];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-10">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Native Desktop UI
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Explore the Real MCSet Experience
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          See actual in-app screenshots of MCSet managing servers, installing plugins, running tunnels, and orchestrating backups.
        </p>
      </div>

      {/* Main Showcase Card */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-700/80 shadow-2xl bg-slate-950/95 max-w-6xl mx-auto">
        {/* Window Chrome Header */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 gap-3">
          {/* Window Buttons & Title */}
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
            <span className="ml-3 text-xs font-semibold text-slate-300 truncate">
              MCSet v0.1.0 — {currentTab.headline}
            </span>
          </div>

          {/* Screenshot Navigation Tabs */}
          <div className="flex items-center overflow-x-auto bg-slate-950/90 p-1 rounded-lg border border-slate-800 text-xs gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md scale-105'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Screenshot & Highlights Grid */}
        <div className="p-4 sm:p-6 bg-slate-950 flex flex-col lg:flex-row gap-6 items-center">
          {/* Screenshot Display with Hover Zoom */}
          <div className="w-full lg:w-3/4 relative group cursor-pointer" onClick={() => setLightboxOpen(true)}>
            <div className="rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-900 transition-all duration-300 group-hover:border-emerald-500/50">
              <img
                src={currentTab.imageSrc}
                alt={currentTab.alt}
                className="w-full h-auto object-cover transform transition-transform duration-500 group-hover:scale-[1.01]"
              />
            </div>

            {/* Click to Expand Overlay */}
            <div className="absolute top-4 right-4 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Click to Expand</span>
            </div>
          </div>

          {/* Right Column: Tab Features & Details */}
          <div className="w-full lg:w-1/4 space-y-4 text-left">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Feature Spotlight
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                {currentTab.headline}
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {currentTab.description}
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              {currentTab.features.map((feat, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-xs text-slate-300 leading-snug">{feat}</span>
                </div>
              ))}
            </div>

            <div className="pt-3">
              <button
                onClick={() => setLightboxOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                View Fullscreen Screenshot
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox Modal */}
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
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
              >
                Close (Esc)
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
              <img
                src={currentTab.imageSrc}
                alt={currentTab.alt}
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
