import React from 'react';

export const EngineShowcase: React.FC = () => {
  const engines = [
    {
      name: 'Paper',
      category: 'Plugins',
      badge: 'Popular',
      desc: 'High performance Minecraft server software providing significant optimizations and gameplay bug fixes.',
      color: 'border-red-500/40 text-red-400 bg-red-500/10',
    },
    {
      name: 'Purpur',
      category: 'Custom Plugins',
      badge: 'Feature-Rich',
      desc: 'Drop-in replacement for Paper designed for configurability, new gameplay mechanics, and ridiculous performance.',
      color: 'border-purple-500/40 text-purple-400 bg-purple-500/10',
    },
    {
      name: 'Fabric',
      category: 'Mods',
      badge: 'Lightweight',
      desc: 'Modular, fast mod loader that updates within minutes of official Minecraft releases with minimal overhead.',
      color: 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10',
    },
    {
      name: 'Forge',
      category: 'Heavy Mods',
      badge: 'Ecosystem',
      desc: 'The legendary modding platform powering classic and complex tech/magic modpacks with thousands of mods.',
      color: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
    },
    {
      name: 'NeoForge',
      category: 'Modern Mods',
      badge: 'Community',
      desc: 'The community-driven continuation of the Forge mod loader for modern versions (1.20.2+).',
      color: 'border-orange-500/40 text-orange-400 bg-orange-500/10',
    },
    {
      name: 'Vanilla',
      category: 'Official',
      badge: 'Mojang',
      desc: 'The pure, unmodified official Minecraft server directly from Mojang Studios. Supports release & snapshots.',
      color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
    },
    {
      name: 'Folia',
      category: 'Multi-Threaded',
      badge: 'Cutting-Edge',
      desc: 'Paper fork that splits world ticking into independent regions across multiple CPU threads for 500+ players.',
      color: 'border-teal-500/40 text-teal-400 bg-teal-500/10',
    },
    {
      name: 'Velocity & Bungee',
      category: 'Proxy Networks',
      badge: 'Networks',
      desc: 'Next-generation Minecraft proxy to link multiple game servers together seamlessly into one realm.',
      color: 'border-blue-500/40 text-blue-400 bg-blue-500/10',
    },
  ];

  return (
    <section id="engines" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
        <div>
          <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
            Engine Freedom
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
            Every Major Server Engine Supported
          </h2>
          <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-2xl">
            Switch between modded adventures, high-TPS plugin servers, or pure vanilla realms with zero manual file tampering.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {engines.map((eng, idx) => (
          <div
            key={idx}
            className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-all hover:-translate-y-1"
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${eng.color}`}>
                {eng.badge}
              </span>
              <span className="text-[11px] text-slate-500 font-mono">{eng.category}</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5">{eng.name}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{eng.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};
