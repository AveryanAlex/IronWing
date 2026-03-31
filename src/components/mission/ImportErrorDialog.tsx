import { AlertTriangle, X } from "lucide-react";

type ImportErrorDialogProps = {
  title: string;
  details: string;
  onClose: () => void;
};

export function ImportErrorDialog({ title, details, onClose }: ImportErrorDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl border border-border bg-bg-primary p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-danger" />
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-text-muted hover:bg-bg-tertiary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <pre className="mb-4 max-h-48 overflow-auto rounded-lg bg-bg-secondary p-3 text-xs text-text-secondary">
          {details}
        </pre>
        <button
          onClick={onClose}
          className="w-full rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-tertiary"
        >
          Close
        </button>
      </div>
    </div>
  );
}
