import React, { useState } from 'react';
import { Download, Github, Menu, X } from 'lucide-react';

interface NavbarProps {
  onDownloadClick: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onDownloadClick }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: 'Features', href: '#features' },
    { name: 'Engines', href: '#engines' },
    { name: 'Tunnels', href: '#tunnels' },
    { name: 'AI Assistant', href: '#ai-assistant' },
    { name: 'Download', href: '#download' },
    { name: 'FAQ', href: '#faq' },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center p-1.5 shadow-glow-emerald transition-transform group-hover:scale-105">
              <img src="./icon.png" alt="MCSet Logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1.5">
                MCSet
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  v0.1.0
                </span>
              </span>
            </div>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-300">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="hover:text-emerald-400 transition-colors"
              >
                {link.name}
              </a>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="hidden sm:flex items-center space-x-3">
            <a
              href="https://github.com/Chandi371/mcset"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all"
            >
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
            <button
              onClick={onDownloadClick}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg shadow-glow-emerald transition-all transform hover:-translate-y-0.5"
            >
              <Download className="w-4 h-4" />
              <span>Download Free</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 border border-slate-800"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden glass-panel border-b border-slate-800 px-4 pt-2 pb-6 space-y-3 bg-slate-950/95">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 rounded-md text-base font-medium text-slate-300 hover:text-white hover:bg-slate-800/60"
            >
              {link.name}
            </a>
          ))}
          <div className="pt-4 border-t border-slate-800 flex flex-col gap-2.5">
            <a
              href="https://github.com/Chandi371/mcset"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-slate-200 bg-slate-900 border border-slate-700 rounded-lg"
            >
              <Github className="w-4 h-4" />
              GitHub Repository
            </a>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onDownloadClick();
              }}
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold text-slate-950 bg-emerald-400 rounded-lg"
            >
              <Download className="w-4 h-4" />
              Download Free (v0.1.0)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
