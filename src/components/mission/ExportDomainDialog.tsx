import { useState } from "react";
import { X } from "lucide-react";
import type { ExportDomain } from "../../lib/mission-plan-io";

type ExportDomainDialogProps = {
  hasFence: boolean;
  hasRally: boolean;
  /** Called with the domains the user chose to exclude, or null on cancel. */
  onConfirm: (excludeDomains: ExportDomain[]) => void;
  onCancel: () => void;
};

/**
 * Lets the user choose which plan domains to include in the exported .plan file.
 * Mission is always included — it is shown as a disabled checked item for clarity.
 * Fence and Rally are opt-out when their respective data exists.
 */
export function ExportDomainDialog({ hasFence, hasRally, onConfirm, onCancel }: ExportDomainDialogProps) {
  const [includeFence, setIncludeFence] = useState(true);
  const [includeRally, setIncludeRally] = useState(true);

  function handleExport() {
    const excludeDomains: ExportDomain[] = [];
    if (!includeFence) excludeDomains.push("fence");
    if (!includeRally) excludeDomains.push("rally");
    onConfirm(excludeDomains);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-80 rounded-xl border border-border bg-bg-primary p-5 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Export Plan</h3>
          <button
            onClick={onCancel}
            className="rounded p-1 text-text-muted hover:bg-bg-tertiary"
            aria-label="Cancel export"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs text-text-secondary">
          Choose which domains to include in the exported file.
        </p>
        <div className="mb-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-text-primary opacity-50">
            <input type="checkbox" checked disabled className="accent-accent" />
            Mission
          </label>
          {hasFence && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={includeFence}
                onChange={(e) => setIncludeFence(e.target.checked)}
                className="accent-accent"
              />
              Fence
            </label>
          )}
          {hasRally && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={includeRally}
                onChange={(e) => setIncludeRally(e.target.checked)}
                className="accent-accent"
              />
              Rally
            </label>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            Export
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-tertiary"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
