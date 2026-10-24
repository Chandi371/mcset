import React, { useState, useEffect } from 'react';
import { Download, ChevronDown, Check, ArrowRight } from 'lucide-react';

interface PlatformInfo {
  name: string;
  os: 'windows' | 'mac' | 'linux';
  fileName: string;
  url: string;
  format: string;
}

export const Hero: React.FC = () => {
  const [platform, setPlatform] = useState<PlatformInfo>({
    name: 'Windows',
    os: 'windows',
    fileName: 'mcset_0.1.0_x64-setup.exe',
    url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64-setup.exe',
    format: '.exe installer',
  });

  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes('mac')) {
      setPlatform({
        name: 'macOS (Apple Silicon)',
        os: 'mac',
        fileName: 'mcset_0.1.0_aarch64.dmg',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_aarch64.dmg',
        format: '.dmg image',
      });
    } else if (userAgent.includes('linux')) {
      setPlatform({
        name: 'Linux',
        os: 'linux',
        fileName: 'mcset_0.1.0_amd64.AppImage',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_amd64.AppImage',
        format: '.AppImage',
      });
    } else {
      setPlatform({
        name: 'Windows',
        os: 'windows',
        fileName: 'mcset_0.1.0_x64-setup.exe',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64-setup.exe',
        format: '.exe installer',
      });
    }
  }, []);

  const platformDownloads: Record<'windows' | 'mac' | 'linux', { label: string; desc: string; url: string }[]> = {
    windows: [
      {
        label: 'Windows Setup (.exe)',
        desc: 'Recommended installer with shortcuts & auto-updater',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64-setup.exe',
      },
      {
        label: 'Windows MSI (.msi)',
        desc: 'Standard Windows Installer package',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_x64_en-US.msi',
      },
      {
        label: 'Windows Portable (.exe)',
        desc: 'Zero-install standalone executable',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset.exe',
      },
    ],
    mac: [
      {
        label: 'macOS Apple Silicon (.dmg)',
        desc: 'For M1 / M2 / M3 / M4 Macs (Recommended)',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_aarch64.dmg',
      },
      {
        label: 'macOS App Bundle (.app.tar.gz)',
        desc: 'Standalone compressed application bundle',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset.app.tar.gz',
      },
    ],
    linux: [
      {
        label: 'Universal AppImage (.AppImage)',
        desc: 'Runs on all modern Linux distributions (Recommended)',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_amd64.AppImage',
      },
      {
        label: 'Debian / Ubuntu (.deb)',
        desc: 'For Ubuntu, Debian, Linux Mint',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset_0.1.0_amd64.deb',
      },
      {
        label: 'Fedora / RHEL (.rpm)',
        desc: 'For Fedora, RedHat, openSUSE',
        url: 'https://github.com/Chandi371/mcset/releases/download/v0.1.0/mcset-0.1.0-1.x86_64.rpm',
      },
    ],
  };

  const currentOptions = platformDownloads[platform.os] || platformDownloads.windows;

  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-32 overflow-hidden">
      {/* Background radial glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-48 left-1/4 w-[500px] h-[300px] bg-cyan-500/10 blur-[100px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Release Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-inner mb-6 text-xs sm:text-sm text-slate-300">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-semibold text-emerald-400">Release v0.1.0 Live</span>
          <span className="text-slate-500">|</span>
          <span>Now with Linux & macOS Support</span>
          <a
            href="https://github.com/Chandi371/mcset/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 ml-1 font-medium"
          >
            Changelog <ArrowRight className="w-3 h-3" />
          </a>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white max-w-5xl mx-auto leading-[1.12]">
          The Modern, One-Click{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Minecraft Server Manager
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto font-normal leading-relaxed">
          Create Paper, Fabric, Purpur, Forge, or Vanilla servers in seconds. Install Modrinth modpacks with 1-click, auto-provision Java runtimes, and host friends publicly <span className="text-emerald-400 font-medium">without port-forwarding</span>.
        </p>

        {/* Download & Action Buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 relative max-w-md mx-auto sm:max-w-none">
          {/* Main Download Button Group */}
          <div className="relative inline-flex rounded-xl shadow-glow-emerald">
            <a
              href={platform.url}
              className="inline-flex items-center justify-center gap-3 px-6 py-3.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-base rounded-l-xl transition-all"
            >
              <Download className="w-5 h-5 text-slate-950" />
              <span>Download for {platform.name}</span>
            </a>

            {/* Dropdown trigger */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="px-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-r-xl border-l border-emerald-600/30 transition-colors flex items-center justify-center"
              aria-label="Select other operating systems"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <>
                {/* Backdrop to close dropdown on click outside */}
                <div 
                  className="fixed inset-0 z-40 bg-black/20" 
                  onClick={() => setDropdownOpen(false)} 
                />
                
                <div className="absolute top-full left-0 right-0 sm:right-auto sm:w-80 mt-2 glass-panel bg-slate-900/98 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-left backdrop-blur-xl">
                  <div className="px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
                    Other {platform.name} Formats
                  </div>
                  {currentOptions.map((item, idx) => (
                    <a
                      key={idx}
                      href={item.url}
                      onClick={() => setDropdownOpen(false)}
                      className="block px-3.5 py-2.5 hover:bg-slate-800/80 transition-colors text-slate-200 border-b border-slate-800/40 last:border-b-0"
                    >
                      <div className="text-sm font-medium text-emerald-400 flex items-center justify-between">
                        <span>{item.label}</span>
                        <Download className="w-3.5 h-3.5 text-slate-400" />
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
                    </a>
                  ))}
                  <div className="p-2 border-t border-slate-800 bg-slate-950/60">
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full text-center text-[11px] text-slate-400 hover:text-emerald-400 transition-colors py-1"
                    >
                      Need macOS or Linux? View all platforms ↓
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Secondary GitHub Button */}
          <a
            href="https://github.com/Chandi371/mcset"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 glass-panel bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white font-medium text-base rounded-xl transition-all border border-slate-700"
          >
            <span>View Source on GitHub</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">★ Star</span>
          </a>
        </div>

        {/* Key Guarantee Badges */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-400">
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>100% Free & Open Source</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>No Account or Signup Required</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Native Rust Speed (Lightweight)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>Auto-Managed Java 8, 17, 21</span>
          </div>
        </div>
      </div>
    </section>
  );
};
