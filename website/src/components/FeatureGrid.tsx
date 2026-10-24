import React from 'react';
import { 
  Zap, 
  Wifi, 
  Cpu, 
  Box, 
  Sparkles, 
  Sliders 
} from 'lucide-react';

export const FeatureGrid: React.FC = () => {
  const features = [
    {
      icon: <Zap className="w-6 h-6 text-emerald-400" />,
      title: '1-Click Server Setup',
      desc: 'Deploy Paper, Purpur, Fabric, Forge, NeoForge, or Vanilla servers. MCSet downloads official JARs and handles installer execution automatically.',
      badge: '6 Loaders Supported',
    },
    {
      icon: <Wifi className="w-6 h-6 text-purple-400" />,
      title: 'Zero-Port-Forwarding Multiplayer',
      desc: 'Play with friends over an outbound Portal raw TCP tunnel. Share an address without editing router port-forwarding rules or exposing your personal IP.',
      badge: 'Outbound Tunneling',
    },
    {
      icon: <Cpu className="w-6 h-6 text-cyan-400" />,
      title: 'Auto-Managed OpenJDK',
      desc: 'MCSet detects your Minecraft version and downloads isolated Eclipse Temurin OpenJDK runtimes (Java 8, 17, or 21) into your app data without altering global PATH.',
      badge: 'Adoptium Runtimes',
    },
    {
      icon: <Box className="w-6 h-6 text-amber-400" />,
      title: 'Modrinth Integration',
      desc: 'Browse, search, and install plugins, mods, and complete .mrpack modpacks directly from Modrinth with automated dependency and loader resolution.',
      badge: 'mrpack Installer',
    },
    {
      icon: <Sparkles className="w-6 h-6 text-pink-400" />,
      title: 'Model Context Protocol (MCP)',
      desc: 'Native MCP integration enables AI-assisted log analysis and diagnostics. Sensitive actions require explicit single-use cryptographic approval before running.',
      badge: 'Gated Permissions',
    },
    {
      icon: <Sliders className="w-6 h-6 text-teal-400" />,
      title: 'Dual-Mode Config & Access',
      desc: 'Tune server.properties with visual sliders and switches or raw text with syntax highlighting. Manage operators, whitelists, and banned players effortlessly.',
      badge: 'Visual Editor',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Core Capabilities
        </h2>
        <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Engineered for Local Minecraft Hosting
        </p>
        <p className="mt-4 text-base sm:text-lg text-slate-400">
          Eliminate manual JAR management, Java environment conflicts, and router configuration headaches. MCSet keeps your server files local, private, and under your control.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feat, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 group-hover:scale-105 transition-transform">
                {feat.icon}
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {feat.badge}
              </span>
            </div>

            <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">
              {feat.title}
            </h3>

            <p className="text-sm text-slate-400 leading-relaxed">
              {feat.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
