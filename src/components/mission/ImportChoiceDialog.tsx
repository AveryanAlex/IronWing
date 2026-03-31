import { X } from "lucide-react";

export type ImportChoice = "replace" | "append" | "cancel";

type ImportChoiceDialogProps = {
  onChoice: (choice: ImportChoice) => void;
};

export function ImportChoiceDialog({ onChoice }: ImportChoiceDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-xl border border-border bg-bg-primary p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Import Mission</h3>
          <button onClick={() => onChoice("cancel")} className="rounded p-1 text-text-muted hover:bg-bg-tertiary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-text-secondary">
          The editor already has mission data. How should the imported file be applied?
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={() => onChoice("replace")} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
            Replace all
          </button>
          <button onClick={() => onChoice("append")} className="rounded-lg border border-border bg-bg-secondary px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-tertiary">
            Append after existing
          </button>
          <button onClick={() => onChoice("cancel")} className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-tertiary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
