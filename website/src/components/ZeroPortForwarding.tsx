import React from 'react';
import { Wifi, ShieldAlert, CheckCircle, Globe2 } from 'lucide-react';

export const ZeroPortForwarding: React.FC = () => {
  return (
    <section id="tunnels" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        {/* Left Column: Context & Details */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Wifi className="w-3.5 h-3.5" />
            Zero-Port-Forwarding Multiplayer
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Play with Friends Anywhere Without Router Headaches
          </h2>

          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Hosting a Minecraft server used to require navigating arcane router settings, fighting ISP Carrier-Grade NAT (CGNAT), and exposing your personal home IP address to the internet.
          </p>

          <p className="mt-3 text-base text-slate-400 leading-relaxed">
            MCSet comes with built-in, verified <strong className="text-purple-300">Portal Tunneling</strong>. Flip one switch, and MCSet establishes a secure outgoing tunnel that generates a public join address your friends can paste into their Minecraft client.
          </p>

          <div className="mt-8 space-y-3.5">
            {[
              {
                title: 'Bypasses CGNAT & Strict Firewalls',
                desc: 'Works on university Wi-Fi, mobile hotspots, and ISPs that block incoming ports.',
              },
              {
                title: 'Keeps Your Home IP Hidden',
                desc: 'Your private IP address is never revealed to players connecting to your server.',
              },
              {
                title: 'Cryptographic SHA-256 Verification',
                desc: 'Tunnel binaries are verified against cryptographic hashes before execution.',
              },
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">{item.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Visual Comparison */}
        <div className="space-y-4">
          {/* Old Way Card */}
          <div className="p-5 rounded-xl bg-red-950/20 border border-red-500/30">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2">
              <ShieldAlert className="w-4 h-4" />
              The Old, Painful Way
            </div>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>Log in to router admin portal (192.168.1.1)</li>
              <li>Configure static DHCP leases & open port 25565</li>
              <li>Fails completely on CGNAT, dorms, and cellular internet</li>
              <li>Exposes your private home IP address to players</li>
            </ul>
          </div>

          {/* MCSet Way Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/40 shadow-glow-purple">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Globe2 className="w-4 h-4" />
                The MCSet Way
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                1-Click Instant
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Tunnel Status</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Active
                </span>
              </div>
              <div className="font-mono text-sm sm:text-base text-purple-300 bg-slate-900 p-2.5 rounded-lg border border-purple-500/20 text-center font-bold">
                smp-friends.portal.sh:25565
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Send this address to your friends. They join directly through Multiplayer!
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
