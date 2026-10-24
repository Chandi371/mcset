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
      title: '1-Click Server Creation',
      desc: 'Deploy Paper, Purpur, Fabric, Forge, NeoForge, or Vanilla servers in seconds. MCSet downloads official JARs and installers with zero manual setup.',
      badge: '10+ Engines',
    },
    {
      icon: <Wifi className="w-6 h-6 text-purple-400" />,
      title: 'Zero-Port-Forwarding Multiplayer',
      desc: 'Play with friends worldwide without opening router ports or exposing your home IP. Built-in Portal tunnel generates a shareable public address instantly.',
      badge: 'Public Tunnels',
    },
    {
      icon: <Cpu className="w-6 h-6 text-cyan-400" />,
      title: 'Auto-Managed Java Runtimes',
      desc: 'Never struggle with Java versions again. MCSet detects and installs isolated Adoptium / Temurin OpenJDK 8, 17, 21, and 23 runtimes per server.',
      badge: 'Isolated JDKs',
    },
    {
      icon: <Box className="w-6 h-6 text-amber-400" />,
      title: 'Modrinth & CurseForge Store',
      desc: 'Browse, search, and install thousands of mods, plugins, and full .mrpack modpacks directly inside the app with automatic dependency resolution.',
      badge: 'Modpack Installer',
    },
    {
      icon: <Sparkles className="w-6 h-6 text-pink-400" />,
      title: 'Built-in Server AI (MCP)',
      desc: 'Diagnose lag, analyze crash stack traces, and optimize server tick timings. Destructive actions require your one-time cryptographic approval token.',
      badge: 'AI Diagnostics',
    },
    {
      icon: <Sliders className="w-6 h-6 text-teal-400" />,
      title: 'Visual Config & Player Control',
      desc: 'Fine-tune server.properties using intuitive toggles and sliders or raw code. Manage operators, whitelists, banned players, and avatars effortlessly.',
      badge: 'Dual-Mode Editor',
    },
  ];

  return (
    <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h2 className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Engineered for Simplicity & Power
        </h2>
        <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Everything You Need to Host Minecraft
        </p>
        <p className="mt-4 text-base sm:text-lg text-slate-400">
          No complex port-forwarding, no Java version conflicts, no command-line headache. MCSet handles all the plumbing so you can just jump in and play.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feat, idx) => (
          <div
            key={idx}
            className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 group-hover:scale-110 transition-transform">
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
