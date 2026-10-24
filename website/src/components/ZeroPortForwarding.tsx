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
            Outbound Tunneling
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            Multiplayer Without Router Port Forwarding
          </h2>

          <p className="mt-4 text-base text-slate-300 leading-relaxed">
            Hosting a Minecraft server traditionally requires accessing router administration panels, assigning static local IPs, opening port 25565, or troubleshooting Carrier-Grade NAT (CGNAT) restrictions from your internet service provider.
          </p>

          <p className="mt-3 text-base text-slate-400 leading-relaxed">
            MCSet integrates verified <strong className="text-purple-300">Portal raw TCP tunneling</strong>. When activated, MCSet initiates an outbound TCP connection to a relay node, providing an address your friends can enter directly into Minecraft Multiplayer.
          </p>

          <div className="mt-8 space-y-3.5">
            {[
              {
                title: 'Works Behind CGNAT & Standard Home NAT',
                desc: 'Because connections are outbound to relay nodes, standard incoming port forwarding is not required.',
              },
              {
                title: 'Protects Home IP Privacy',
                desc: 'Connecting players resolve and connect through the relay endpoint rather than discovering your residential IP address.',
              },
              {
                title: 'Cryptographic Binary Integrity Verification',
                desc: 'Portal binaries (v2.6.4) are verified against embedded SHA-256 hashes before execution on Windows, macOS, and Linux.',
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
          {/* Traditional Setup Card */}
          <div className="p-5 rounded-xl bg-red-950/20 border border-red-500/30">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2">
              <ShieldAlert className="w-4 h-4" />
              Traditional Manual Setup
            </div>
            <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
              <li>Log in to router admin portal (192.168.1.1)</li>
              <li>Configure static DHCP reservation &amp; open TCP port 25565</li>
              <li>Often blocked on cellular internet, student housing, and CGNAT</li>
              <li>Exposes residential IP address to all connecting players</li>
            </ul>
          </div>

          {/* MCSet Integrated Tunnel Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-900 to-slate-900 border border-purple-500/40 shadow-glow-purple">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Globe2 className="w-4 h-4" />
                MCSet Integrated Portal Tunnel
              </div>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                1-Click Activation
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="text-xs text-slate-400 flex items-center justify-between">
                <span>Tunnel Protocol</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  Raw TCP Relay
                </span>
              </div>
              <div className="font-mono text-sm sm:text-base text-purple-300 bg-slate-900 p-2.5 rounded-lg border border-purple-500/20 text-center font-bold">
                your-subdomain.portal.sh:25565
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Players connect through standard Minecraft Java Edition Multiplayer. Requires active internet access to reach relay nodes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
