import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const FAQSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'Is MCSet completely free to use?',
      a: 'Yes! MCSet is free for personal and non-commercial community use under the PolyForm Noncommercial 1.0.0 License. All code is public on GitHub.',
    },
    {
      q: 'Do I need to install Java manually before running a server?',
      a: 'No! MCSet features automatic Java runtime management. When you create a server (for example, 1.21 requiring Java 21, or 1.12.2 requiring Java 8), MCSet automatically downloads and isolates the correct Eclipse Temurin OpenJDK runtime without modifying your global system PATH.',
    },
    {
      q: 'Do my friends need to install MCSet to join my server?',
      a: 'No! Your friends only need standard vanilla Minecraft or the corresponding modded client. They join through Minecraft\'s normal Multiplayer menu by entering the public tunnel address (e.g. your-server.portal.sh:25565).',
    },
    {
      q: 'Can I import my existing Minecraft server or single-player world?',
      a: 'Yes. MCSet has an "Import Server" option allowing you to select any existing server directory or upload a server .zip file. All world data, configs, player data, and plugin settings are preserved.',
    },
    {
      q: 'Does MCSet support complex modpacks like Better MC or All the Mods?',
      a: 'Yes! MCSet integrates directly with Modrinth and CurseForge, and includes a built-in mrpack-install engine that downloads mods, configs, scripts, and server jars in one click.',
    },
    {
      q: 'How does Zero-Port-Forwarding work?',
      a: 'MCSet integrates the verified Portal tunneling protocol. It initiates a secure, outbound connection to a high-speed tunnel relay, eliminating the need to log into your router or configure NAT/port forwarding. It also protects your home IP address from being exposed to players.',
    },
  ];

  return (
    <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800/80">
      <div className="text-center mb-12">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Got Questions?
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => (
          <div
            key={idx}
            className="rounded-xl bg-slate-900/60 border border-slate-800/80 overflow-hidden transition-colors"
          >
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-full py-4 px-5 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-white hover:text-emerald-400 transition-colors"
            >
              <span>{faq.q}</span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform ${
                  openIdx === idx ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </button>

            {openIdx === idx && (
              <div className="px-5 pb-5 text-xs sm:text-sm text-slate-300 border-t border-slate-800/50 pt-3 leading-relaxed">
                {faq.a}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
