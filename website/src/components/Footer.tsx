import React from 'react';
import { Github } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full border-t border-slate-800 bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Copy */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center p-1">
            <img src="./icon.png" alt="MCSet" className="w-full h-full object-contain" />
          </div>
          <div>
            <div className="font-bold text-white text-sm">MCSet Server Manager</div>
            <p className="text-xs text-slate-500">
              Licensed under PolyForm Noncommercial 1.0.0. Built with Tauri 2, Rust &amp; React.
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="flex items-center space-x-6 text-xs text-slate-400">
          <a
            href="https://github.com/Chandi371/mcset"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
          <a
            href="https://github.com/Chandi371/mcset/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
          >
            Releases (v0.1.0)
          </a>
          <a
            href="https://github.com/Chandi371/mcset/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
          >
            Report Issue
          </a>
          <a
            href="https://github.com/Chandi371/mcset/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-emerald-400 flex items-center gap-1.5 transition-colors"
          >
            License
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-slate-900 text-center text-[11px] text-slate-600">
        NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
      </div>
    </footer>
  );
};
