import React, { useState, useEffect } from "react";
import {
  Sliders,
  Save,
  FileCode,
  Check,
  AlertTriangle,
  Search,
  Eye,
} from "lucide-react";
import { ConfigDiff, ServerConfigItem, ServerProfile } from "../types";
import { api } from "../lib/api";

interface ConfigEditorProps {
  server: ServerProfile;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({ server }) => {
  const [activeTab, setActiveTab] = useState<"visual" | "raw">("visual");
  const [configItems, setConfigItems] = useState<ServerConfigItem[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [rawContent, setRawContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [proposedDiffs, setProposedDiffs] = useState<ConfigDiff[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await api.getServerConfig(server.id);
      setConfigItems(items);
      const initialMap: Record<string, string> = {};
      for (const item of items) {
        initialMap[item.key] = item.value;
      }
      setEditedValues(initialMap);

      const raw = await api.readRawConfig(server.id, "server.properties");
      setRawContent(raw);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [server.id]);

  const categories = [
    "All",
    "General",
    "Gameplay",
    "World",
    "Network",
    "Security",
    "Custom",
  ];

  const handleValueChange = (key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  };

  const hasUnsavedChanges = Object.keys(editedValues).some((key) => {
    const original = configItems.find((i) => i.key === key);
    return original ? original.value !== editedValues[key] : false;
  });

  const handlePreviewChanges = async () => {
    try {
      setError(null);
      const diffs = await api.proposeServerConfig(server.id, editedValues);
      setProposedDiffs(diffs);
      setDiffModalOpen(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleApplyChanges = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.applyServerConfig(server.id, editedValues);
      setDiffModalOpen(false);
      setSuccessMessage("Configuration saved successfully. A backup was created.");
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadConfig();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRaw = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.writeRawConfig(server.id, "server.properties", rawContent);
      setSuccessMessage("Raw server.properties saved successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadConfig();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = configItems.filter((item) => {
    const matchesCat =
      selectedCategory === "All" || item.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      search === "" ||
      item.key.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-foreground">Server Configuration</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure {server.name}’s settings visually or edit raw properties
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Tab Switcher */}
          <div className="bg-secondary p-1 rounded-lg border border-border flex items-center">
            <button
              onClick={() => setActiveTab("visual")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === "visual"
                  ? "bg-card text-emerald-400 font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Visual Settings
            </button>
            <button
              onClick={() => setActiveTab("raw")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === "raw"
                  ? "bg-card text-emerald-400 font-semibold shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Raw Editor
            </button>
          </div>

          {activeTab === "visual" ? (
            <button
              onClick={handlePreviewChanges}
              disabled={!hasUnsavedChanges || saving}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" /> Preview & Save
            </button>
          ) : (
            <button
              onClick={handleSaveRaw}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save File
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-lg text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === "visual" ? (
        <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden">
          {/* Filter Bar */}
          <div className="p-3 bg-secondary/30 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    selectedCategory === cat
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search settings..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56 bg-secondary/70 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Settings Grid */}
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Loading configuration...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                No matching settings found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredItems.map((item) => {
                  const currentValue = editedValues[item.key] ?? item.value;
                  const isModified = currentValue !== item.value;

                  return (
                    <div
                      key={item.key}
                      className={`p-4 rounded-xl border transition-all ${
                        isModified
                          ? "bg-emerald-500/5 border-emerald-500/50 shadow-sm"
                          : "bg-secondary/20 border-border/80 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <span className="font-semibold text-xs text-foreground font-mono">
                            {item.key}
                          </span>
                          {item.restart_required && (
                            <span
                              className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-sans border border-amber-500/20"
                              title="Restart required to take effect"
                            >
                              Restart Required
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase font-mono px-1.5 py-0.5 bg-secondary rounded">
                          {item.category}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted-foreground leading-normal mb-3">
                        {item.description}
                      </p>

                      {/* Controls depending on data_type */}
                      {item.data_type === "boolean" ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleValueChange(
                                item.key,
                                currentValue === "true" ? "false" : "true"
                              )
                            }
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              currentValue === "true" ? "bg-emerald-500" : "bg-secondary"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                currentValue === "true" ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                          <span className="text-xs font-mono capitalize text-foreground">
                            {currentValue}
                          </span>
                        </div>
                      ) : item.data_type === "select" && item.allowed_values ? (
                        <select
                          value={currentValue}
                          onChange={(e) => handleValueChange(item.key, e.target.value)}
                          className="w-full bg-secondary/80 border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        >
                          {item.allowed_values.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      ) : item.data_type === "number" ? (
                        <input
                          type="number"
                          value={currentValue}
                          onChange={(e) => handleValueChange(item.key, e.target.value)}
                          className="w-full bg-secondary/80 border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => handleValueChange(item.key, e.target.value)}
                          className="w-full bg-secondary/80 border border-border text-foreground text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Raw Editor */
        <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 bg-secondary/30 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <FileCode className="w-4 h-4 text-emerald-400" />
              Editing <code className="text-emerald-400">server.properties</code>
            </span>
            <span>Automatic timestamped backup made on save</span>
          </div>
          <textarea
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            className="flex-1 p-4 bg-black/80 text-foreground font-mono text-xs focus:outline-none resize-none leading-relaxed"
            placeholder="# server.properties content..."
          />
        </div>
      )}

      {/* Diff Confirmation Modal */}
      {diffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Review Proposed Changes ({proposedDiffs.length})
              </h3>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-4">
              <p className="text-xs text-muted-foreground">
                The following properties will be updated in{" "}
                <code className="text-emerald-400 font-mono">server.properties</code>. A backup will
                be generated before saving.
              </p>

              {proposedDiffs.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No changes detected.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-secondary/60 text-muted-foreground text-[11px]">
                      <tr>
                        <th className="p-2.5">Property</th>
                        <th className="p-2.5">Current Value</th>
                        <th className="p-2.5">New Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proposedDiffs.map((d) => (
                        <tr key={d.key} className="hover:bg-white/[0.02]">
                          <td className="p-2.5 font-semibold text-foreground">{d.key}</td>
                          <td className="p-2.5 text-rose-400 bg-rose-500/5 line-through">
                            {d.old_value || "(empty)"}
                          </td>
                          <td className="p-2.5 text-emerald-400 bg-emerald-500/5">
                            {d.new_value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-secondary/20">
              <button
                onClick={() => setDiffModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyChanges}
                disabled={saving || proposedDiffs.length === 0}
                className="px-5 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? "Saving..." : "Confirm & Apply Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
