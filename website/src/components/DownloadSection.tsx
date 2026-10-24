import React from 'react';
import { Download, Monitor, Apple, Terminal, FileArchive, ExternalLink } from 'lucide-react';
import { RELEASE_CONFIG } from '../config/releases';

export const DownloadSection: React.FC = () => {
  const winArtifacts = RELEASE_CONFIG.artifacts.filter((a) => a.platform === 'windows');
  const macArtifacts = RELEASE_CONFIG.artifacts.filter((a) => a.platform === 'macos');
  const linuxArtifacts = RELEASE_CONFIG.artifacts.filter((a) => a.platform === 'linux');

  return (
    <section id="download" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Official Release
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Download MCSet {RELEASE_CONFIG.version}
        </h2>
        <p className="mt-3 text-base sm:text-lg text-slate-400">
          Verified desktop binaries for Windows, macOS (Apple Silicon), and Linux.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Windows Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  <Monitor className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Windows</h3>
                  <p className="text-xs text-slate-400">Windows 10 / 11 (64-bit)</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Standard installer with automatic desktop shortcuts, start menu entry, and clean uninstaller.
            </p>

            <div className="space-y-2.5">
              {winArtifacts.map((item) => (
                <a
                  key={item.id}
                  href={item.downloadUrl}
                  className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-between transition-colors ${
                    item.isPrimary
                      ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold shadow-glow-emerald'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span>{item.label}</span>
                    <span className={`text-[10px] ${item.isPrimary ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      {item.sizeFormatted}
                    </span>
                  </div>
                  <Download className={`w-4 h-4 ${item.isPrimary ? 'text-slate-950' : 'text-slate-400'}`} />
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            Prerequisites: 64-bit Windows OS. Java is automatically provisioned if missing.
          </div>
        </div>

        {/* macOS Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-700/30 text-slate-200 border border-slate-600/40">
                  <Apple className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">macOS</h3>
                  <p className="text-xs text-slate-400">Apple Silicon (M1/M2/M3/M4)</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Native Apple Silicon ARM64 build for maximum performance on modern Mac hardware.
            </p>

            <div className="space-y-2.5">
              {macArtifacts.map((item) => (
                <a
                  key={item.id}
                  href={item.downloadUrl}
                  className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-between transition-colors ${
                    item.isPrimary
                      ? 'bg-slate-200 hover:bg-white text-slate-950 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span>{item.label}</span>
                    <span className={`text-[10px] ${item.isPrimary ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      {item.sizeFormatted}
                    </span>
                  </div>
                  <Download className={`w-4 h-4 ${item.isPrimary ? 'text-slate-950' : 'text-slate-400'}`} />
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            Requires macOS 11.0 (Big Sur) or newer on Apple Silicon. (Intel x86_64 Macs not built in v0.1.0).
          </div>
        </div>

        {/* Linux Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Terminal className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Linux</h3>
                  <p className="text-xs text-slate-400">64-bit x86_64 Distributions</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Universal AppImage executable alongside native Debian (.deb) and RedHat (.rpm) packages.
            </p>

            <div className="space-y-2.5">
              {linuxArtifacts.map((item) => (
                <a
                  key={item.id}
                  href={item.downloadUrl}
                  className={`w-full py-2.5 px-4 rounded-xl font-medium text-xs flex items-center justify-between transition-colors ${
                    item.isPrimary
                      ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span>{item.label}</span>
                    <span className={`text-[10px] ${item.isPrimary ? 'text-slate-900/80' : 'text-slate-400'}`}>
                      {item.sizeFormatted}
                    </span>
                  </div>
                  <Download className={`w-4 h-4 ${item.isPrimary ? 'text-slate-950' : 'text-slate-400'}`} />
                </a>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            Prerequisites: GLIBC 2.31+. Ubuntu 22.04+ AppImage requires FUSE (sudo apt install libfuse2).
          </div>
        </div>
      </div>

      {/* Linux CLI Quick Command */}
      <div className="mt-8 p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-xs max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-slate-400">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Quick Run on Linux:</span>
        </div>
        <div className="bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-emerald-300 select-all overflow-x-auto w-full sm:w-auto">
          chmod +x mcset_0.1.0_amd64.AppImage &amp;&amp; ./mcset_0.1.0_amd64.AppImage
        </div>
      </div>

      {/* Fallback & Source Code Links */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
        <a
          href={RELEASE_CONFIG.releasesPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors underline underline-offset-4"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          All GitHub Releases &amp; Hashes
        </a>
        <a
          href={RELEASE_CONFIG.sourceZipUrl}
          className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors underline underline-offset-4"
        >
          <FileArchive className="w-3.5 h-3.5" />
          Download Source Bundle (mcset-v0.1.0-source.zip)
        </a>
        <a
          href={RELEASE_CONFIG.githubRepoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors underline underline-offset-4"
        >
          Browse GitHub Repository
        </a>
      </div>
    </section>
  );
};
