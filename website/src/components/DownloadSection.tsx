import React from 'react';
import { Download, Monitor, Apple, Terminal } from 'lucide-react';

export const DownloadSection: React.FC = () => {
  const version = 'v0.1.0';
  const baseUrl = `https://github.com/Chandi371/mcset/releases/download/${version}`;

  return (
    <section id="download" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Get Started Today
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Download MCSet {version}
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-400">
          Available for Windows, macOS, and Linux. Choose the installer or portable binary tailored for your operating system.
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
              Standard Windows setup with auto-updating capabilities, desktop shortcuts, and uninstaller.
            </p>

            <div className="space-y-2.5">
              <a
                href={`${baseUrl}/mcset_0.1.0_x64-setup.exe`}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-between transition-colors shadow-glow-emerald"
              >
                <span>Setup Installer (.exe)</span>
                <Download className="w-4 h-4" />
              </a>

              <a
                href={`${baseUrl}/mcset_0.1.0_x64_en-US.msi`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-between border border-slate-700 transition-colors"
              >
                <span>Windows MSI (.msi)</span>
                <Download className="w-4 h-4 text-slate-400" />
              </a>

              <a
                href={`${baseUrl}/mcset.exe`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-between border border-slate-700 transition-colors"
              >
                <span>Portable Executable (.exe)</span>
                <Download className="w-4 h-4 text-slate-400" />
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            SHA-256 verified release build
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
              Native Apple Silicon ARM64 disk image for maximum performance and battery efficiency.
            </p>

            <div className="space-y-2.5">
              <a
                href={`${baseUrl}/mcset_0.1.0_aarch64.dmg`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-white text-slate-950 font-bold text-xs flex items-center justify-between transition-colors"
              >
                <span>Apple Silicon DMG (.dmg)</span>
                <Download className="w-4 h-4" />
              </a>

              <a
                href={`${baseUrl}/mcset.app.tar.gz`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-between border border-slate-700 transition-colors"
              >
                <span>App Bundle (.app.tar.gz)</span>
                <Download className="w-4 h-4 text-slate-400" />
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            Requires macOS 11.0 Big Sur or later
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
                  <p className="text-xs text-slate-400">Ubuntu, Debian, Fedora, Arch</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              Standalone AppImage running across all distributions, plus native Debian/Ubuntu and RPM packages.
            </p>

            <div className="space-y-2.5">
              <a
                href={`${baseUrl}/mcset_0.1.0_amd64.AppImage`}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-between transition-colors"
              >
                <span>Universal AppImage (.AppImage)</span>
                <Download className="w-4 h-4" />
              </a>

              <a
                href={`${baseUrl}/mcset_0.1.0_amd64.deb`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-between border border-slate-700 transition-colors"
              >
                <span>Debian / Ubuntu Package (.deb)</span>
                <Download className="w-4 h-4 text-slate-400" />
              </a>

              <a
                href={`${baseUrl}/mcset-0.1.0-1.x86_64.rpm`}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-between border border-slate-700 transition-colors"
              >
                <span>Fedora / RHEL Package (.rpm)</span>
                <Download className="w-4 h-4 text-slate-400" />
              </a>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-slate-500">
            GLIBC 2.31+ or newer supported
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
    </section>
  );
};
