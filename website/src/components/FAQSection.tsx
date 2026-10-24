import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export const FAQSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What are the licensing terms for MCSet?',
      a: 'MCSet is distributed under the PolyForm Noncommercial License 1.0.0. It is free to use for personal hosting and non-commercial community servers. The full source code is public on GitHub.',
    },
    {
      q: 'Do I need to install Java manually before running a server?',
      a: 'No. When you configure a server, MCSet checks your system for a compatible Java runtime. If none is found, it automatically downloads an official isolated Eclipse Temurin OpenJDK runtime (Java 8, 17, or 21) via the Adoptium API into your local application directory, without altering your global PATH.',
    },
    {
      q: 'Do other players need to install MCSet to join my server?',
      a: 'No. Other players connect using the standard Minecraft Java Edition game client. They join via Minecraft\'s Multiplayer menu by entering either your direct LAN address (for players on your home network) or your public Portal tunnel address (for remote friends).',
    },
    {
      q: 'How does Zero-Port-Forwarding work?',
      a: 'MCSet integrates the Portal tunneling client (v2.6.4). It establishes an outbound TCP connection to a relay, eliminating the need to log into your router or configure NAT/port forwarding. Remote players connect through the relay address, which keeps your personal IP address private.',
    },
    {
      q: 'Which operating systems and architectures are supported in v0.1.0?',
      a: 'v0.1.0 provides official release binaries for 64-bit Windows (10 and 11), 64-bit Linux (x86_64 AppImage, deb, rpm), and Apple Silicon macOS (arm64 dmg and tar.gz for M1/M2/M3/M4 Macs). Note: Intel-based Macs are not currently built for this release.',
    },
    {
      q: 'Can I import an existing world or custom server JAR?',
      a: 'Yes. MCSet allows importing an existing server folder or uploading a server .zip archive. All existing world files, player data, server.properties, and plugin folders are preserved.',
    },
  ];

  return (
    <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800/80">
      <div className="text-center mb-12">
        <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
          Frequently Asked Questions
        </span>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mt-1">
          Everything You Need to Know
        </h2>
      </div>

      <div className="space-y-3">
        {faqs.map((faq, idx) => {
          const isOpen = openIdx === idx;
          const contentId = `faq-content-${idx}`;
          const buttonId = `faq-button-${idx}`;

          return (
            <div
              key={idx}
              className="rounded-xl bg-slate-900/60 border border-slate-800/80 overflow-hidden transition-colors"
            >
              <button
                id={buttonId}
                aria-expanded={isOpen}
                aria-controls={contentId}
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full py-4 px-5 text-left flex items-center justify-between text-sm sm:text-base font-semibold text-white hover:text-emerald-400 transition-colors"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${
                    isOpen ? 'rotate-180 text-emerald-400' : ''
                  }`}
                />
              </button>

              {isOpen && (
                <div
                  id={contentId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="px-5 pb-5 text-xs sm:text-sm text-slate-300 border-t border-slate-800/50 pt-3 leading-relaxed"
                >
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
