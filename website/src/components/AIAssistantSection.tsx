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
          AI-Assisted Diagnostics &amp; Crash Analysis
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-400">
          MCSet exposes standardized Model Context Protocol (MCP) tool endpoints. Inspect server health, diagnose performance bottlenecks, and analyze crash stack traces with strict permission boundaries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Cpu className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Performance Diagnostics</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Diagnose server slowdowns by analyzing tick rates (TPS), tick timing (MSPT), memory consumption, and entity counts across active loaded world dimensions.
          </p>
        </div>

        {/* Card 2 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
            <Bug className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Crash Log Parsing</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            When a server encounters an unhandled exception, MCSet parses crash-reports and logs to identify conflicting mod IDs, version mismatches, or corrupted NBT tags.
          </p>
        </div>

        {/* Card 3 */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Cryptographic Gating</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Sensitive operations (such as server deletion or administrative console commands) require user consent via single-use approval tokens with canonical payload hashing to prevent unauthorized execution.
          </p>
        </div>
      </div>
    </section>
  );
};
