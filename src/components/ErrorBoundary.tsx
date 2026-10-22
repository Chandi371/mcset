import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("MCSet Uncaught React Error:", error, errorInfo);
    try {
      localStorage.setItem(
        "mcset_last_react_error",
        JSON.stringify({
          message: error?.message || "Unknown error",
          stack: error?.stack || "",
          componentStack: errorInfo?.componentStack || "",
          timestamp: Date.now(),
        })
      );
    } catch {}
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetCache = () => {
    try {
      localStorage.removeItem("mcset_ai_chat_sessions_v2");
      localStorage.removeItem("mcset_active_chat_session_id_v2");
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-6 select-none font-sans text-foreground">
          <div className="max-w-xl w-full bg-card border border-rose-500/30 rounded-2xl p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Application Encountered an Error</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  MCSet encountered an unexpected UI exception, but your server files and database are safe.
                </p>
              </div>
            </div>

            <div className="p-3 bg-secondary/80 border border-border rounded-xl font-mono text-[11px] text-rose-300 max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
              {this.state.error?.message || "An unknown rendering error occurred"}
              {this.state.error?.stack && (
                <div className="mt-2 text-[10px] text-muted-foreground opacity-80 border-t border-border/50 pt-2">
                  {this.state.error.stack}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={this.handleResetCache}
                className="px-3.5 py-2 text-xs font-semibold bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors"
                title="Clears local UI cache and reloads"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear UI Cache & Reload
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-background rounded-lg shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
