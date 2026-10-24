import React, { useState, useEffect } from 'react';
import { Download, ChevronDown, Check, ArrowRight, Github } from 'lucide-react';
import { RELEASE_CONFIG, ReleaseArtifact } from '../config/releases';

export const Hero: React.FC = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<'windows' | 'macos' | 'linux'>('windows');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.navigator) {
      const ua = window.navigator.userAgent.toLowerCase();
      if (ua.includes('mac')) {
        setSelectedPlatform('macos');
      } else if (ua.includes('linux')) {
        setSelectedPlatform('linux');
      } else {
        setSelectedPlatform('windows');
      }
    }
  }, []);

  const platformArtifacts = RELEASE_CONFIG.artifacts.filter((a) => a.platform === selectedPlatform);
  const primaryArtifact: ReleaseArtifact =
    platformArtifacts.find((a) => a.isPrimary) || platformArtifacts[0];
  const alternativeArtifacts = platformArtifacts.filter((a) => a.id !== primaryArtifact.id);

  const platformDisplayNames: Record<'windows' | 'macos' | 'linux', string> = {
    windows: 'Windows',
    macos: 'macOS (Apple Silicon)',
    linux: 'Linux (x86_64)',
  };

  return (
    <section className="relative pt-12 pb-16 md:pt-20 md:pb-24 overflow-hidden">
      {/* Background radial glow */}
      <div 
        aria-hidden="true" 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[360px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none -z-10" 
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Release Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-inner mb-6 text-xs sm:text-sm text-slate-300">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
          <span className="font-semibold text-emerald-400">Release {RELEASE_CONFIG.version} Available</span>
          <span className="text-slate-500">|</span>
          <a
            href={RELEASE_CONFIG.releasesPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 hover:text-emerald-400 flex items-center gap-1 font-medium transition-colors"
          >
            Release Notes <ArrowRight className="w-3 h-3" />
          </a>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.12]">
          Modern, Desktop-Native{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Minecraft Server Management
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto font-normal leading-relaxed">
          Create Paper, Fabric, Purpur, Forge, NeoForge, or Vanilla servers locally. Automate isolated Java installation, install Modrinth modpacks in 1-click, and host multiplayer over trustless Portal tunnels.
        </p>

        {/* Platform Selector Tabs (Requirement 4: manual selection without relying solely on UA) */}
        <div className="mt-8 flex items-center justify-center gap-1.5" role="tablist" aria-label="Select Operating System">
          {(['windows', 'macos', 'linux'] as const).map((plat) => (
            <button
              key={plat}
              role="tab"
              aria-selected={selectedPlatform === plat}
              onClick={() => {
                setSelectedPlatform(plat);
                setDropdownOpen(false);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedPlatform === plat
                  ? 'bg-slate-800 text-emerald-400 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
              }`}
            >
              {platformDisplayNames[plat]}
            </button>
          ))}
        </div>

        {/* Download & Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 relative max-w-md mx-auto sm:max-w-none">
          {/* Primary Download Button with Dropdown for Alternatives */}
          <div className="relative inline-flex rounded-xl shadow-glow-emerald">
            <a
              href={primaryArtifact.downloadUrl}
              className="inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-base rounded-l-xl transition-all"
            >
              <Download className="w-5 h-5 text-slate-950" />
              <span>Download for {platformDisplayNames[selectedPlatform].split(' ')[0]}</span>
              <span className="text-xs font-normal opacity-80">({primaryArtifact.format}, {primaryArtifact.sizeFormatted})</span>
            </a>

            {/* Dropdown Toggle */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-r-xl border-l border-emerald-600/30 transition-colors flex items-center justify-center"
              aria-label={`Select other ${platformDisplayNames[selectedPlatform]} formats`}
              aria-expanded={dropdownOpen}
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/20" 
                  onClick={() => setDropdownOpen(false)} 
                />
                <div className="absolute top-full left-0 right-0 sm:right-auto sm:w-84 mt-2 glass-panel bg-slate-900/98 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-left backdrop-blur-xl">
                  <div className="px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    Other {platformDisplayNames[selectedPlatform]} Formats
                  </div>
                  {alternativeArtifacts.length > 0 ? (
                    alternativeArtifacts.map((item) => (
                      <a
                        key={item.id}
                        href={item.downloadUrl}
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3.5 py-2.5 hover:bg-slate-800/80 transition-colors text-slate-200 border-b border-slate-800/40 last:border-b-0"
                      >
                        <div className="text-sm font-medium text-emerald-400 flex items-center justify-between">
                          <span>{item.label}</span>
                          <span className="text-[11px] text-slate-400 font-mono">{item.sizeFormatted}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{item.notes}</div>
                      </a>
                    ))
                  ) : (
                    <div className="px-3.5 py-2 text-xs text-slate-400">
                      Standard package is primary.
                    </div>
                  )}
                  <div className="p-2 border-t border-slate-800 bg-slate-950/60">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full text-center text-[11px] text-slate-400 hover:text-emerald-400 transition-colors py-1"
                    >
                      View all platforms &amp; instructions ↓
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Secondary GitHub Button */}
          <a
            href={RELEASE_CONFIG.githubRepoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 glass-panel bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white font-medium text-base rounded-xl transition-all border border-slate-700"
          >
            <Github className="w-5 h-5" />
            <span>GitHub Repository</span>
          </a>
        </div>

        {/* Accurate Product Characteristics */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-400">
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Free for Non-Commercial Use (PolyForm NC 1.0.0)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>No Account or Signup Required</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Lightweight Native Rust Binary (Tauri 2)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Adoptium OpenJDK Auto-Provisioning</span>
          </div>
        </div>
      </div>
    </section>
  );
};
