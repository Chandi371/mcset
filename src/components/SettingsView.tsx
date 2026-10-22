import React, { useState, useEffect } from "react";
import {
  Cpu,
  Key,
  Save,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  History,
  Eye,
  EyeOff,
} from "lucide-react";
import { AiProviderConfig, JavaRuntime, OperationRecord } from "../types";
import { api } from "../lib/api";

export const SettingsView: React.FC = () => {
  const [javas, setJavas] = useState<JavaRuntime[]>([]);
  const [scanningJava, setScanningJava] = useState(false);

  const [aiConfig, setAiConfig] = useState<AiProviderConfig>({
    provider: "openai",
    api_key: "",
    model: "gpt-4o-mini",
    base_url: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingAi, setSavingAi] = useState(false);

  const [operations, setOperations] = useState<OperationRecord[]>([]);

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadSettings = async () => {
    try {
      const [runtimes, cfg, ops] = await Promise.all([
        api.detectJavaRuntimes(),
        api.getAiConfig(),
        api.listOperations(),
      ]);
      setJavas(runtimes);
      setAiConfig(cfg);
      setOperations(ops);
    } catch (err) {
      setNotification({ type: "error", message: `Failed to load settings: ${String(err)}` });
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleScanJava = async () => {
    setScanningJava(true);
    try {
      const res = await api.detectJavaRuntimes();
      setJavas(res);
      setNotification({
        type: "success",
        message: `Detected ${res.length} Java runtimes across system directories.`,
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setNotification({ type: "error", message: `Java scan failed: ${String(err)}` });
    } finally {
      setScanningJava(false);
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      await api.saveAiConfig(aiConfig);
      setNotification({
        type: "success",
        message: "AI Provider configuration saved securely.",
      });
      setTimeout(() => setNotification(null), 3000);
    } catch (err) {
      setNotification({ type: "error", message: `Failed to save AI settings: ${String(err)}` });
    } finally {
      setSavingAi(false);
    }
  };

  const defaultModels: Record<string, string> = {
    openai: "gpt-4o-mini",
    anthropic: "claude-3-5-sonnet-20241022",
    gemini: "gemini-1.5-flash",
    ollama: "llama3.2",
    openrouter: "anthropic/claude-3.5-sonnet",
    custom: "gpt-4o-mini",
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground">Platform Settings</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage Java environments, configure BYOK AI credentials, and review security logs
          </p>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 border animate-in fade-in ${
            notification.type === "success"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border-rose-500/30 text-rose-300"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Settings Sections */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1">
        {/* Section 1: Java Runtimes */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-foreground">Detected Java Runtimes</h3>
                <p className="text-[11px] text-muted-foreground">
                  Cross-platform scanner checks PATH, JAVA_HOME, Adoptium, Zulu, BellSoft, and Program Files
                </p>
              </div>
            </div>

            <button
              onClick={handleScanJava}
              disabled={scanningJava}
              className="px-3 py-1.5 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanningJava ? "animate-spin" : ""}`} />
              {scanningJava ? "Scanning..." : "Rescan System"}
            </button>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-secondary/60 text-muted-foreground text-[11px]">
                <tr>
                  <th className="p-2.5">Vendor</th>
                  <th className="p-2.5">Major Version</th>
                  <th className="p-2.5">Full Version</th>
                  <th className="p-2.5">Executable Path</th>
                  <th className="p-2.5">Compatibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {javas.map((j) => (
                  <tr key={j.path} className="hover:bg-white/[0.02]">
                    <td className="p-2.5 font-sans font-semibold text-foreground">{j.vendor}</td>
                    <td className="p-2.5 text-emerald-400 font-bold">Java {j.major_version}</td>
                    <td className="p-2.5 text-muted-foreground">{j.version_str}</td>
                    <td className="p-2.5 text-slate-300 truncate max-w-xs">{j.path}</td>
                    <td className="p-2.5 font-sans">
                      {j.major_version >= 21 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                          Modern MC (1.20.5+)
                        </span>
                      ) : j.major_version >= 17 ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
                          MC 1.17 - 1.20.4
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                          Legacy (MC &le; 1.16)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: AI Provider (BYOK) */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground">AI Provider Configuration (BYOK)</h3>
              <p className="text-[11px] text-muted-foreground">
                Keys are stored locally in your encrypted SQLite settings. Choose between hosted APIs or local Ollama.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveAiConfig} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">AI Provider</label>
                <select
                  value={aiConfig.provider}
                  onChange={(e) => {
                    const prov = e.target.value;
                    let targetBaseUrl = aiConfig.base_url;
                    if (prov === "ollama") targetBaseUrl = "http://localhost:11434/v1";
                    else if (prov === "openrouter") targetBaseUrl = "https://openrouter.ai/api/v1";
                    else if (prov === "openai") targetBaseUrl = "https://api.openai.com/v1";

                    setAiConfig((prev) => ({
                      ...prev,
                      provider: prov,
                      model: defaultModels[prov] || prev.model,
                      base_url: targetBaseUrl,
                    }));
                  }}
                  className="w-full bg-secondary/70 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-sans"
                >
                  <option value="openrouter">OpenRouter (Multi-model / Recommended)</option>
                  <option value="openai">OpenAI (GPT-4o, GPT-4o-mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                  <option value="gemini">Google Gemini (Gemini 1.5/2.0)</option>
                  <option value="ollama">Local Ollama (Offline / Private)</option>
                  <option value="custom">Custom OpenAI-compatible API</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Model Name</span>
                  {aiConfig.model === "openrouter/free" && (
                    <span className="text-[10px] text-amber-400 font-medium">
                      ⚠️ "openrouter/free" routes to arbitrary slow reasoning models. Pick a fast free model below:
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder="e.g. gpt-4o-mini, anthropic/claude-3.5-sonnet, openai/gpt-4o"
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
                  className="w-full bg-secondary/70 border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />

                {aiConfig.provider === "openrouter" && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Recommended:</span>
                    {[
                      { id: "google/gemini-2.0-flash-exp:free", label: "⚡ Gemini 2.0 (Free & Fast)" },
                      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "🦙 Llama 3.3 70B (Free)" },
                      { id: "openai/gpt-4o-mini", label: "✨ GPT-4o-mini" },
                      { id: "anthropic/claude-3.5-sonnet", label: "🧠 Claude 3.5 Sonnet" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setAiConfig((prev) => ({ ...prev, model: m.id }))}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                          aiConfig.model === m.id
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                            : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>API Key {aiConfig.provider === "ollama" ? "(Optional for Ollama)" : ""}</span>
                {aiConfig.api_key.trim().startsWith("sk-or-v1") && (
                  <span className="text-[10px] text-emerald-400 font-medium">
                    ✓ OpenRouter API Key detected
                  </span>
                )}
              </label>
              <div className="relative flex items-center">
                <input
                  type={showApiKey ? "text" : "password"}
                  placeholder={
                    aiConfig.provider === "ollama"
                      ? "Not required for local Ollama"
                      : "Paste your API key here (sk-... or sk-or-v1...)"
                  }
                  value={aiConfig.api_key}
                  onChange={(e) => {
                    const key = e.target.value;
                    const isOpenRouter = key.trim().startsWith("sk-or-v1");
                    setAiConfig((prev) => ({
                      ...prev,
                      api_key: key,
                      provider: isOpenRouter ? "openrouter" : prev.provider,
                      base_url: isOpenRouter && (!prev.base_url || prev.base_url.includes("api.openai.com"))
                        ? "https://openrouter.ai/api/v1"
                        : prev.base_url,
                      model: isOpenRouter && prev.model === "gpt-4o-mini"
                        ? "anthropic/claude-3.5-sonnet"
                        : prev.model,
                    }));
                  }}
                  className="w-full bg-secondary/70 border border-border rounded-lg px-3.5 py-2 pr-10 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {(aiConfig.provider === "custom" ||
              aiConfig.provider === "ollama" ||
              aiConfig.provider === "openrouter") && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">API Base URL</label>
                <input
                  type="text"
                  placeholder="https://openrouter.ai/api/v1"
                  value={aiConfig.base_url || ""}
                  onChange={(e) => setAiConfig((prev) => ({ ...prev, base_url: e.target.value }))}
                  className="w-full bg-secondary/70 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                />
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={savingAi}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                {savingAi ? "Saving..." : "Save AI Credentials"}
              </button>
            </div>
          </form>
        </div>

        {/* Section 3: Operation Audit Log */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-foreground">Security & Operation History</h3>
              <p className="text-[11px] text-muted-foreground">
                Audit trail of server actions, backups, and MCP tools executed by the user or AI
              </p>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-secondary/60 text-muted-foreground text-[11px] sticky top-0">
                <tr>
                  <th className="p-2.5">Time</th>
                  <th className="p-2.5">Action</th>
                  <th className="p-2.5">Details</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {operations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground font-sans">
                      No operations recorded yet.
                    </td>
                  </tr>
                ) : (
                  operations.map((op) => (
                    <tr key={op.id} className="hover:bg-white/[0.02]">
                      <td className="p-2.5 text-muted-foreground">
                        {new Date(op.timestamp * 1000).toLocaleTimeString()}
                      </td>
                      <td className="p-2.5 font-bold text-foreground">{op.operation_type}</td>
                      <td className="p-2.5 text-slate-300 truncate max-w-sm">{op.details}</td>
                      <td className="p-2.5 font-sans">
                        {op.success ? (
                          <span className="text-[10px] text-emerald-400 font-semibold">SUCCESS</span>
                        ) : (
                          <span className="text-[10px] text-rose-400 font-semibold">FAILED</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
