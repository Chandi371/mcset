import React from 'react';
import { Sparkles, ShieldCheck, Cpu, Bug } from 'lucide-react';

export const AIAssistantSection: React.FC = () => {
  return (
    <section id="ai-assistant" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
      <div className="text-center max-w-3xl mx-auto mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/30 text-pink-400 text-xs font-semibold uppercase tracking-wider mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          Model Context Protocol (MCP) Integrated
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          An Intelligent AI Server Engineer at Your Side
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-400">
          MCSet integrates natively with modern AI agents via the open Model Context Protocol. Connect your favorite LLM or let the built-in assistant debug issues for you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Live Diagnostics</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ask questions like <em>"Why is my server lagging at night?"</em>. The assistant examines tick times, chunk generation, entity counts, and garbage collection pauses to isolate bottlenecks.
          </p>
        </div>

        {/* Card 2 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Bug className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Instant Crash Analysis</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            When a server crashes, MCSet parses the stack trace, identifies the offending mod, invalid block state, or memory overflow, and explains exactly how to fix it in plain English.
          </p>
        </div>

        {/* Card 3 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Cryptographic Safety</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Your server is always protected. The AI cannot delete worlds, alter files, or run destructive console commands without issuing a single-use cryptographic approval token for you to confirm.
          </p>
        </div>
      </div>
    </section>
  );
};
