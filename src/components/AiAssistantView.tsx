import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot,
  Send,
  Sparkles,
  Wrench,
  AlertCircle,
  Trash2,
  Plus,
  MessageSquare,
  Clock,
  Square,
  ChevronDown,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Copy,
  Loader2,
  Check,
} from "lucide-react";
import {
  AiChatMessage,
  AiChatSession,
  AiProviderConfig,
  PendingCommandApproval,
  ServerProfile,
} from "../types";
import { api } from "../lib/api";

interface AiAssistantViewProps {
  activeServer: ServerProfile | null;
  onNavigateToSettings: () => void;
  onAiActiveChange?: (active: boolean) => void;
  onServersChanged?: () => void;
}

const STORAGE_KEY_SESSIONS = "mcset_ai_chat_sessions_v2";
const STORAGE_KEY_ACTIVE_ID = "mcset_active_chat_session_id_v2";

const createDefaultSession = (): AiChatSession => ({
  id: "session-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
  title: "New Conversation",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  messages: [
    {
      role: "assistant",
      content:
        "Hello! I'm your MCSet AI Technician. I can help diagnose server crashes from logs, recommend compatible plugins and mods from Modrinth, propose safe configuration changes, execute console commands, and manage server lifecycles safely. What would you like to do?",
    },
  ],
});

/** Markdown code block with copy button */
const CodeBlock: React.FC<{ language?: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-2 rounded-lg overflow-hidden border border-border/80 bg-background/90 text-foreground font-mono text-[11px]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/70 border-b border-border/60 text-[10px] text-muted-foreground">
        <span className="font-semibold text-emerald-400 uppercase tracking-wider">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors px-1.5 py-0.5 rounded bg-secondary/80 border border-border/40"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 text-[10px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span className="text-[10px]">Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto leading-relaxed whitespace-pre font-mono text-foreground/90 select-text">
        <code className="select-text">{value}</code>
      </pre>
    </div>
  );
};

/** Quick copy button for entire chat message */
const CopyMessageButton: React.FC<{ text: string; isUser?: boolean }> = ({ text, isUser }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[10px] flex items-center gap-1 absolute top-2.5 right-2.5 shadow-sm z-10 select-none ${
        isUser
          ? "bg-emerald-600/70 hover:bg-emerald-600 text-white"
          : "bg-secondary/90 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/60"
      }`}
      title="Copy message text"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span className="text-[10px]">Copy</span>
        </>
      )}
    </button>
  );
};

/** Polished Markdown Renderer */
const MarkdownRenderer: React.FC<{ content: string; className?: string }> = ({
  content,
  className = "",
}) => {
  return (
    <div className={`prose-sm max-w-none text-xs leading-relaxed space-y-2 break-words select-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-sm font-bold text-foreground border-b border-border/50 pb-1 mt-3 mb-1.5">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xs font-bold text-foreground border-b border-border/40 pb-0.5 mt-2.5 mb-1 text-emerald-400">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-foreground mt-2 mb-0.5">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-1.5 pl-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-1.5 pl-1">{children}</ol>,
          li: ({ children }) => <li className="text-foreground/90">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-500/60 pl-3 italic text-muted-foreground my-2">
              {children}
            </blockquote>
          ),
          code({ node, inline, className: codeClass, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClass || "");
            const textValue = String(children).replace(/\n$/, "");

            if (!inline && (match || textValue.includes("\n"))) {
              return <CodeBlock language={match ? match[1] : ""} value={textValue} />;
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded bg-secondary/80 border border-border/60 text-emerald-300 font-mono text-[11px]"
                {...props}
              >
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-border">
              <table className="min-w-full divide-y divide-border text-[11px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2.5 py-1.5 bg-secondary/60 text-left font-semibold text-foreground/80">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="px-2.5 py-1.5 border-t border-border/40">{children}</td>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

/** Interactive Approval Card for Console Commands */
const CommandApprovalCard: React.FC<{
  approval: PendingCommandApproval;
  onResolved: (approvalId: string, resultMsg: string) => void;
}> = ({ approval, onResolved }) => {
  const [acting, setActing] = useState(false);
  const [resolvedStatus, setResolvedStatus] = useState<"approved" | "rejected" | null>(null);

  const handleApprove = async () => {
    setActing(true);
    try {
      const output = await api.approveConsoleCommand(approval.approval_id);
      setResolvedStatus("approved");
      onResolved(approval.approval_id, `Command approved and executed: ${output}`);
    } catch (err) {
      onResolved(approval.approval_id, `Approval failed: ${err}`);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    setActing(true);
    try {
      await api.rejectConsoleCommand(approval.approval_id);
      setResolvedStatus("rejected");
      onResolved(approval.approval_id, "Command was rejected by user.");
    } catch (err) {
      onResolved(approval.approval_id, `Rejection error: ${err}`);
    } finally {
      setActing(false);
    }
  };

  if (resolvedStatus === "approved") {
    return (
      <div className="max-w-[85%] rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs flex items-center gap-2 text-emerald-300 shadow-sm">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>Command <code>{approval.command}</code> was approved and dispatched to server console.</span>
      </div>
    );
  }

  if (resolvedStatus === "rejected") {
    return (
      <div className="max-w-[85%] rounded-xl bg-secondary/50 border border-border p-3 text-xs flex items-center gap-2 text-muted-foreground shadow-sm">
        <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
        <span>Execution of <code>{approval.command}</code> was rejected.</span>
      </div>
    );
  }

  return (
    <div className="max-w-[85%] rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 space-y-3 shadow-md">
      <div className="flex items-center gap-2 text-amber-400">
        <ShieldAlert className="w-4 h-4 shrink-0" />
        <span className="font-bold text-xs uppercase tracking-wider">
          Console Command Requires Approval
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-foreground/90">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground font-medium">Server:</span>
          <span className="font-semibold text-emerald-400">{approval.server_id}</span>
        </div>

        <div className="flex items-start gap-1.5">
          <span className="text-muted-foreground font-medium shrink-0 mt-0.5">Command:</span>
          <code className="bg-background/80 border border-amber-500/30 px-2 py-0.5 rounded font-mono text-[11px] text-amber-300">
            {approval.command}
          </code>
        </div>

        <div className="flex items-start gap-1.5">
          <span className="text-muted-foreground font-medium shrink-0">Action:</span>
          <span>{approval.explanation}</span>
        </div>

        <div className="flex items-start gap-1.5">
          <span className="text-muted-foreground font-medium shrink-0">Potential Impact:</span>
          <span className="text-amber-300/90 font-medium">{approval.potential_impact}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
        <button
          onClick={handleApprove}
          disabled={acting}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Run
        </button>
        <button
          onClick={handleReject}
          disabled={acting}
          className="px-3 py-1.5 rounded-lg bg-secondary hover:bg-rose-500/20 text-muted-foreground hover:text-rose-300 font-semibold text-xs border border-border flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <XCircle className="w-3.5 h-3.5" /> Reject
        </button>
      </div>
    </div>
  );
};

const CollapsibleToolOutput: React.FC<{
  content: string;
  toolCallId?: string;
  onApprovalResolved?: (approvalId: string, resultMsg: string) => void;
}> = ({ content, onApprovalResolved }) => {
  const [open, setOpen] = useState(false);

  let parsed: any = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // raw string
  }

  // If this tool output is a pending command approval card
  if (parsed && parsed.status === "requires_approval" && parsed.approval_id) {
    const approval: PendingCommandApproval = {
      approval_id: parsed.approval_id,
      server_id: parsed.server_id || "",
      command: parsed.command || "",
      explanation: parsed.explanation || "",
      potential_impact: parsed.potential_impact || "",
      category: parsed.category || "General",
      created_at: Date.now(),
      expires_at: Date.now() + 300000,
    };

    return (
      <CommandApprovalCard
        approval={approval}
        onResolved={(id, msg) => {
          onApprovalResolved?.(id, msg);
        }}
      />
    );
  }

  let preview = "";
  if (parsed) {
    if (parsed.message) {
      preview = parsed.message;
    } else if (parsed.server?.name) {
      preview = `Server '${parsed.server.name}' (${parsed.server.server_type} ${parsed.server.minecraft_version})`;
    } else if (parsed.status) {
      preview = `Status: ${parsed.status}`;
    } else if (Array.isArray(parsed.versions)) {
      preview = `Fetched ${parsed.versions.length} versions (Latest: ${parsed.latest_release})`;
    } else if (parsed.error) {
      preview = `Error: ${parsed.error}`;
    } else {
      const keys = Object.keys(parsed);
      preview = keys.slice(0, 3).map((k) => `${k}: ${JSON.stringify(parsed[k])}`).join(", ");
    }
  } else {
    preview = content.slice(0, 80).replace(/\n/g, " ");
  }

  return (
    <div className="max-w-[85%] rounded-xl bg-secondary/40 border border-border text-[11px] font-mono text-muted-foreground overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-secondary/70 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          <Wrench className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="font-semibold text-emerald-400 text-[10px] uppercase tracking-wider shrink-0">
            Tool Result:
          </span>
          <span className="truncate text-foreground/85 text-[11px] font-normal">{preview}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 bg-secondary/80 px-1.5 py-0.5 rounded border border-border/50">
          <span>{open ? "Hide" : "Show"}</span>
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </div>
      </button>

      {open && (
        <div className="p-3 border-t border-border/60 bg-background/50 overflow-x-auto max-h-64 animate-in fade-in duration-150">
          <pre className="text-[10px] leading-relaxed whitespace-pre-wrap font-mono text-foreground/90">
            {parsed ? JSON.stringify(parsed, null, 2) : content}
          </pre>
        </div>
      )}
    </div>
  );
};

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  activeServer,
  onNavigateToSettings,
  onAiActiveChange,
  onServersChanged,
}) => {
  // Chat sessions state with local storage persistence
  const [sessions, setSessions] = useState<AiChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sanitized: AiChatSession[] = parsed
            .filter((s) => s && typeof s === "object")
            .map((s, idx) => ({
              id: s.id || `session-${Date.now()}-${idx}`,
              title: s.title || "New Conversation",
              createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
              updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
              messages: Array.isArray(s.messages)
                ? s.messages.filter((m: any) => m && typeof m === "object")
                : [
                    {
                      role: "assistant",
                      content:
                        "Hello! I'm your MCSet AI Technician. How can I help you manage your server today?",
                    },
                  ],
              serverId: s.serverId,
            }));
          if (sanitized.length > 0) {
            return sanitized;
          }
        }
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    }
    return [createDefaultSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
      if (savedId) return savedId;
    } catch {}
    return sessions[0]?.id || "session-default";
  });

  const [showSessionsSidebar, setShowSessionsSidebar] = useState<boolean>(true);
  const [input, setInput] = useState("");
  // Track loading per session to prevent cross-chat indicator bleed
  const [loadingSessionIds, setLoadingSessionIds] = useState<Record<string, boolean>>({});
  const [liveSteps, setLiveSteps] = useState<
    Array<{
      id: string;
      toolName?: string;
      description: string;
      status: "running" | "done" | "error";
      content?: string;
    }>
  >([]);
  const [liveThought, setLiveThought] = useState<string | null>(null);
  const [liveStreamingText, setLiveStreamingText] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiProviderConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  // Sync sessions to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save chat sessions:", e);
    }
  }, [sessions]);

  // Sync activeSessionId to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, activeSessionId);
    } catch (e) {
      console.error("Failed to save active chat session ID:", e);
    }
  }, [activeSessionId]);

  useEffect(() => {
    api.getAiConfig().then((cfg) => setAiConfig(cfg));

    let unlisten: (() => void) | undefined;
    api.listenAiEvents((event) => {
      if (event.event_type === "thought") {
        if (event.content) {
          setLiveThought(event.content);
        }
      } else if (event.event_type === "tool_call") {
        const stepId = event.tool_call_id || "step-" + Date.now();
        setLiveSteps((prev) => {
          if (prev.some((s) => s.id === stepId)) return prev;
          return [
            ...prev,
            {
              id: stepId,
              toolName: event.tool_name || undefined,
              description: event.step_description || `Running ${event.tool_name}...`,
              status: "running",
              content: event.content || undefined,
            },
          ];
        });
      } else if (event.event_type === "tool_result") {
        setLiveSteps((prev) =>
          prev.map((s) => {
            if (s.id === event.tool_call_id || s.toolName === event.tool_name) {
              return {
                ...s,
                status: event.step_description?.toLowerCase().includes("fail") ? "error" : "done",
                description: event.step_description || s.description,
              };
            }
            return s;
          })
        );
      } else if (event.event_type === "message") {
        if (event.content) {
          setLiveStreamingText(event.content);
        }
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Ensure active session always exists with safe messages array
  const activeSessionIndex = sessions.findIndex((s) => s.id === activeSessionId);
  const activeSession =
    (activeSessionIndex !== -1 ? sessions[activeSessionIndex] : sessions[0]) || createDefaultSession();
  const messages = Array.isArray(activeSession?.messages) ? activeSession.messages : [];
  const isCurrentSessionLoading = !!loadingSessionIds[activeSession.id];
  const isAnySessionLoading = Object.values(loadingSessionIds).some(Boolean);

  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const scrolledUp = distanceFromBottom > 90;
    isUserScrolledUpRef.current = scrolledUp;
    setIsUserScrolledUp(scrolledUp);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  };

  // Dedicated instant auto-scroll during live streaming chunks:
  // Using direct container scrollTop in requestAnimationFrame prevents:
  // 1) Oscillating smooth-scroll battles (jitter/glitching up and down)
  // 2) Scroll bubbling to ancestor elements or the full app window
  // 3) Interruption of user text selection when reading earlier messages
  useEffect(() => {
    if (isUserScrolledUpRef.current) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    const animId = requestAnimationFrame(() => {
      if (!isUserScrolledUpRef.current && messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      }
    });

    return () => cancelAnimationFrame(animId);
  }, [messages.length, isCurrentSessionLoading, liveSteps, liveStreamingText, liveThought]);

  // When switching active session, scroll to bottom
  useEffect(() => {
    isUserScrolledUpRef.current = false;
    setIsUserScrolledUp(false);
    scrollToBottom("auto");
  }, [activeSessionId]);

  useEffect(() => {
    onAiActiveChange?.(isAnySessionLoading);
  }, [isAnySessionLoading, onAiActiveChange]);

  const handleStopAi = async () => {
    try {
      await api.stopAi();
    } catch (err) {
      console.error("Failed to stop AI", err);
    }
    setLoadingSessionIds({});
    setLiveSteps([]);
    setLiveStreamingText(null);
    setLiveThought(null);
  };

  const handleNewChat = () => {
    const newSession = createDefaultSession();
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setError(null);
    setLiveSteps([]);
    setLiveStreamingText(null);
    setLiveThought(null);
    setInput("");
  };

  const handleDeleteSession = (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      const fresh = createDefaultSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
      return;
    }

    const updated = sessions.filter((s) => s.id !== idToDelete);
    setSessions(updated);
    if (activeSessionId === idToDelete) {
      setActiveSessionId(updated[0].id);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isCurrentSessionLoading) return;

    if (!aiConfig?.api_key && aiConfig?.provider !== "ollama") {
      setError(
        "Please configure your AI Provider API key in Settings (or use local Ollama) to use the AI Technician."
      );
      return;
    }

    const targetSessionId = activeSession.id;

    const userMsg: AiChatMessage = {
      role: "user",
      content: text,
    };

    const newHistory = [...messages, userMsg];

    // Auto-title session if it was newly created
    const updatedTitle =
      activeSession.title === "New Conversation"
        ? text.length > 28
          ? text.slice(0, 28) + "..."
          : text
        : activeSession.title;

    // Update session locally with user message
    setSessions((prev) =>
      prev.map((s) =>
        s.id === targetSessionId
          ? {
              ...s,
              title: updatedTitle,
              updatedAt: Date.now(),
              messages: newHistory,
            }
          : s
      )
    );

    setInput("");
    setLoadingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }));
    setError(null);
    setLiveSteps([]);
    setLiveThought("Analyzing request & inspecting server context...");
    setLiveStreamingText(null);
    isUserScrolledUpRef.current = false;
    setIsUserScrolledUp(false);
    requestAnimationFrame(() => scrollToBottom("smooth"));

    try {
      const newMessages = await api.chatWithAi(newHistory, activeServer?.id);
      const messagesToAdd = Array.isArray(newMessages) ? newMessages : [newMessages];

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? {
                ...s,
                updatedAt: Date.now(),
                messages: [...newHistory, ...messagesToAdd],
              }
            : s
        )
      );
      setLiveSteps([]);
      setLiveStreamingText(null);
      setLiveThought(null);
      // Immediately notify parent to reload server list & statuses
      onServersChanged?.();
    } catch (err) {
      setError(String(err));
      setLiveSteps([]);
      setLiveStreamingText(null);
      setLiveThought(null);
    } finally {
      setLoadingSessionIds((prev) => {
        const next = { ...prev };
        delete next[targetSessionId];
        return next;
      });
    }
  };

  const handleApprovalResolved = (_approvalId: string, resultMsg: string) => {
    // Append resolution message to chat session
    const resolutionMsg: AiChatMessage = {
      role: "assistant",
      content: resultMsg,
    };
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              updatedAt: Date.now(),
              messages: [...s.messages, resolutionMsg],
            }
          : s
      )
    );
    onServersChanged?.();
  };

  const handleClearCurrentChat = () => {
    const resetMsgs: AiChatMessage[] = [
      {
        role: "assistant",
        content: "Chat cleared. How can I assist you with your server administration today?",
      },
    ];

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSession.id
          ? {
              ...s,
              title: "New Conversation",
              updatedAt: Date.now(),
              messages: resetMsgs,
            }
          : s
      )
    );
  };

  const formatTimeAgo = (ts?: number) => {
    if (!ts || isNaN(ts)) return "Just now";
    const diff = Math.max(0, Date.now() - ts);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const quickPrompts = [
    {
      title: "Diagnose Server Lag & TPS",
      prompt: "This server is lagging a lot. Can you diagnose the performance, check TPS and tick lag, explain what's causing the bottleneck, and recommend how to fix it?",
    },
    {
      title: "Install Cobblemon Modpack",
      prompt:
        "Search Modrinth for the official 'Cobblemon Official' modpack and install it as a new server.",
    },
    {
      title: "Search Modrinth Modpacks",
      prompt:
        "Search Modrinth for top adventure and performance modpacks for Minecraft 1.20.1 or 1.21.",
    },
    {
      title: "Check & Download Java",
      prompt:
        "Check what Java version my server needs and install the correct portable OpenJDK runtime if missing.",
    },
    {
      title: "Diagnose Startup Logs",
      prompt: "Inspect the recent server logs and explain if there are any errors or warnings.",
    },
    {
      title: "Check Crash Report",
      prompt: "Inspect the latest crash report if any, explain the root cause and recommend fixes.",
    },
    {
      title: "Recommend Performance Plugins",
      prompt:
        "Search Modrinth for essential performance and optimization plugins/mods for my server.",
    },
    {
      title: "Review Server Settings",
      prompt: "Read my server.properties configuration and suggest any recommended adjustments.",
    },
    {
      title: "Create Safety Backup",
      prompt: "Please create a backup snapshot of my server before we make any changes.",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between bg-card border border-border p-4 rounded-xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/10 shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">AI Server Technician</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-medium">
                26 MCP Tools Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Active Server Context:{" "}
              {activeServer ? (
                <span className="text-emerald-400 font-semibold">
                  {activeServer.name} ({activeServer.server_type} {activeServer.minecraft_version})
                </span>
              ) : (
                <span className="text-amber-400">No server selected</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSessionsSidebar(!showSessionsSidebar)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
              showSessionsSidebar
                ? "bg-secondary text-foreground border-border"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
            title="Toggle chat sessions history sidebar"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chats ({sessions.length})</span>
          </button>

          <button
            onClick={handleNewChat}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Start a new chat session"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>
      </div>

      {/* Main Chat Workspace */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Sessions Sidebar */}
        {showSessionsSidebar && (
          <div className="w-64 bg-card border border-border rounded-xl flex flex-col overflow-hidden shrink-0 shadow-sm animate-in fade-in duration-200">
            <div className="p-3 border-b border-border flex items-center justify-between bg-secondary/30">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Chat History ({sessions.length})
              </span>
              <button
                onClick={handleNewChat}
                className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-colors"
                title="New Chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSession.id;
                const isSessionActiveLoading = !!loadingSessionIds[sess.id];
                return (
                  <div
                    key={sess.id}
                    onClick={() => setActiveSessionId(sess.id)}
                    className={`group relative flex items-center justify-between p-2.5 rounded-lg text-xs cursor-pointer transition-all ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium"
                        : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    <div className="flex flex-col min-w-0 pr-6">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{sess.title}</span>
                        {isSessionActiveLoading && (
                          <Sparkles className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] opacity-60 flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatTimeAgo(sess.updatedAt)} • {Array.isArray(sess?.messages) ? sess.messages.length : 0} msgs
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      title="Delete chat session"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-2 border-t border-border bg-secondary/20">
              <button
                onClick={handleClearCurrentChat}
                className="w-full py-1.5 px-2 text-[11px] text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                title="Clear messages in the current conversation"
              >
                <Trash2 className="w-3 h-3" /> Clear Current Chat
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages Window */}
        <div className="flex-1 bg-card border border-border rounded-xl flex flex-col overflow-hidden shadow-sm relative">
          {/* Active Chat Title Subheader */}
          <div className="px-4 py-2 border-b border-border/70 bg-secondary/20 flex items-center justify-between select-none">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground truncate max-w-md">
                {activeSession.title}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({messages.length} messages)
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Last active: {formatTimeAgo(activeSession.updatedAt)}
            </span>
          </div>

          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 p-6 overflow-y-auto space-y-4 select-text overscroll-contain"
          >
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const isTool = m.role === "tool";

              if (isTool) {
                return (
                  <div key={idx} className="flex justify-start">
                    <CollapsibleToolOutput
                      content={m.content}
                      toolCallId={m.tool_call_id || undefined}
                      onApprovalResolved={handleApprovalResolved}
                    />
                  </div>
                );
              }

              return (
                <div
                  key={idx}
                  className={`flex gap-3 group relative ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-1 shadow-sm select-none">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`relative max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2 select-text ${
                      isUser
                        ? "bg-emerald-500 text-background font-medium rounded-tr-sm shadow-md shadow-emerald-500/10"
                        : "bg-secondary/60 border border-border text-foreground rounded-tl-sm shadow-sm"
                    }`}
                  >
                    <CopyMessageButton text={m.content} isUser={isUser} />

                    {isUser ? (
                      <p className="whitespace-pre-wrap select-text pr-8">{m.content}</p>
                    ) : (
                      <div className="pr-8 select-text">
                        <MarkdownRenderer content={m.content} />
                      </div>
                    )}

                    {/* Render inline tool calls if present */}
                    {m.tool_calls && m.tool_calls.length > 0 && (
                      <div className="pt-2.5 border-t border-border/40 space-y-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          Executing Tool Operation:
                        </span>
                        {m.tool_calls.map((tc) => (
                          <div
                            key={tc.id}
                            className="p-2.5 rounded-lg bg-background/70 border border-emerald-500/20 text-[11px] font-mono space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                                {tc.name}
                              </span>
                              <span className="text-[9px] text-muted-foreground opacity-60">ID: {tc.id.slice(0, 8)}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground flex flex-wrap gap-1.5 pt-0.5">
                              {typeof tc.arguments === "object" && tc.arguments !== null ? (
                                Object.entries(tc.arguments).map(([key, val]) => (
                                  <span key={key} className="bg-secondary/70 border border-border/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    <span className="text-foreground/70">{key}:</span>
                                    <span className="text-emerald-400 font-semibold">{JSON.stringify(val)}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-emerald-400">{JSON.stringify(tc.arguments)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isCurrentSessionLoading && (
              <div className="flex gap-3 justify-start animate-in fade-in duration-200">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex flex-col gap-2.5 max-w-2xl flex-1">
                  {/* Dynamic Reasoning & Status Card */}
                  <div className="px-3.5 py-2.5 rounded-xl bg-secondary/50 border border-border/70 flex items-center gap-2.5 text-xs text-muted-foreground shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
                    <span className="font-medium text-foreground/85 leading-normal">
                      {liveThought || (liveSteps.length > 0 ? "Executing operations & analyzing server..." : "Analyzing request & inspecting server context...")}
                    </span>
                  </div>

                  {/* Active Tool Steps Pipeline */}
                  {liveSteps.length > 0 && (
                    <div className="bg-secondary/70 border border-emerald-500/30 rounded-xl p-3 shadow-md space-y-2">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 animate-spin" />
                          AI Technician Running Tools ({liveSteps.filter((s) => s.status === "done").length}/{liveSteps.length})
                        </span>
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                          Live Execution
                        </span>
                      </div>
                      <div className="space-y-1.5 pt-0.5 max-h-56 overflow-y-auto pr-1">
                        {liveSteps.map((step) => (
                          <div
                            key={step.id}
                            className={`flex items-start gap-2 text-xs p-2 rounded-lg transition-all ${
                              step.status === "running"
                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-200"
                                : step.status === "error"
                                ? "bg-rose-500/10 border border-rose-500/20 text-rose-300"
                                : "bg-card/40 border border-border/30 text-muted-foreground"
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {step.status === "running" ? (
                                <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                              ) : step.status === "error" ? (
                                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`font-medium text-[11px] ${
                                    step.status === "running" ? "text-emerald-300" : "text-foreground/85"
                                  }`}
                                >
                                  {step.description}
                                </span>
                                {step.toolName && (
                                  <span className="text-[9px] font-mono bg-secondary/80 px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                                    {step.toolName}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Streaming Assistant Response Preview with Markdown & live typewriter effect */}
                  {liveStreamingText && (
                    <div className="p-4 rounded-2xl bg-secondary/50 border border-emerald-500/25 text-xs text-foreground space-y-2 shadow-md animate-in fade-in duration-150 select-text">
                      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold border-b border-border/40 pb-1.5 select-none">
                        <Bot className="w-3.5 h-3.5" />
                        Technician Writing:
                      </div>
                      <div className="prose prose-invert prose-xs max-w-none leading-relaxed break-words select-text">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {liveStreamingText}
                        </ReactMarkdown>
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="leading-relaxed">{error}</span>
                </div>
                {error.includes("Settings") && (
                  <button
                    onClick={onNavigateToSettings}
                    className="px-2.5 py-1 rounded bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 text-[11px] font-semibold shrink-0 transition-colors"
                  >
                    Open Settings
                  </button>
                )}
              </div>
            )}

            <div className="h-1" />
          </div>

          {/* Floating Scroll to Latest Button */}
          {isUserScrolledUp && (
            <button
              onClick={() => {
                isUserScrolledUpRef.current = false;
                setIsUserScrolledUp(false);
                scrollToBottom("smooth");
              }}
              className="absolute bottom-20 right-8 bg-secondary/95 hover:bg-secondary text-foreground border border-border px-3 py-1.5 rounded-full shadow-xl text-xs flex items-center gap-1.5 transition-all z-20 animate-in fade-in select-none"
            >
              <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scroll to latest</span>
            </button>
          )}

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2 bg-secondary/20 border-t border-border/60 flex items-center gap-2 overflow-x-auto">
            {quickPrompts.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={isCurrentSessionLoading}
                className="text-[11px] px-2.5 py-1 rounded-full bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground shrink-0 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3 h-3 text-emerald-400" />
                {qp.title}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-secondary/40 border-t border-border flex items-center gap-2"
          >
            <input
              type="text"
              placeholder={
                activeServer
                  ? `Ask about ${activeServer.name}, logs, mod recommendations, or commands...`
                  : "Ask anything about Minecraft server administration..."
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isCurrentSessionLoading}
              className="flex-1 bg-secondary/80 border border-border rounded-lg px-3.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {isCurrentSessionLoading ? (
              <button
                type="button"
                onClick={handleStopAi}
                className="px-4 py-2 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-lg shadow-md transition-all flex items-center gap-1.5 animate-pulse shrink-0"
                title="Stop AI execution immediately"
              >
                <Square className="w-3.5 h-3.5 fill-rose-300" /> Stop AI
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
