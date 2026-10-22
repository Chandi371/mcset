import React from "react";
import { AlertTriangle, Info } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <AlertTriangle className="w-5 h-5 text-rose-400" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      default:
        return <Info className="w-5 h-5 text-sky-400" />;
    }
  };

  const getIconBg = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-500/15 border-rose-500/30 text-rose-400";
      case "warning":
        return "bg-amber-500/15 border-amber-500/30 text-amber-400";
      default:
        return "bg-sky-500/15 border-sky-500/30 text-sky-400";
    }
  };

  const getButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20";
      case "warning":
        return "bg-amber-500 hover:bg-amber-600 text-black shadow-amber-500/20";
      default:
        return "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden p-5 space-y-4 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
      >
        <div className="flex items-start gap-3.5">
          <div className={`p-2.5 rounded-lg border shrink-0 ${getIconBg()}`}>
            {getIcon()}
          </div>
          <div className="space-y-1">
            <h3 id="confirm-modal-title" className="text-sm font-bold text-foreground">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border/60">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium text-foreground bg-secondary/80 hover:bg-secondary rounded-lg border border-border transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-md transition-all disabled:opacity-50 flex items-center gap-1.5 ${getButtonClass()}`}
          >
            {isLoading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
