import { createElement } from "react";
import { X } from "lucide-react";
import type { ParamStore } from "../../../params";
import type { ParamMeta, ParamMetadataMap } from "../../../param-metadata";

// ---------------------------------------------------------------------------
// Shared param types used by all primitives
// ---------------------------------------------------------------------------

/** The subset of `useParams()` return consumed by param input primitives. */
export type ParamInputParams = {
  store: ParamStore | null;
  staged: Map<string, number>;
  metadata: ParamMetadataMap | null;
  stage: (name: string, value: number) => void;
  /** Optional unstage callback — when provided, staged badges become dismissible. */
  unstage?: (name: string) => void;
};

// ---------------------------------------------------------------------------
// Shared badge component
// ---------------------------------------------------------------------------

export function StagedBadge({
  paramName,
  unstage,
}: {
  paramName: string;
  unstage?: (name: string) => void;
}) {
  if (unstage) {
    return createElement(
      "button",
      {
        type: "button",
        onClick: () => unstage(paramName),
        className:
          "inline-flex items-center gap-0.5 rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning hover:bg-warning/20 focus:outline-none focus:ring-1 focus:ring-warning/40 transition-colors",
        "aria-label": `Unstage ${paramName}`,
      },
      "staged",
      createElement(X, { size: 8, className: "shrink-0" }),
    );
  }

  return createElement(
    "span",
    {
      className:
        "rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning",
    },
    "staged",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return the staged value if present, otherwise the current vehicle value.
 * Returns `null` when the param is unknown or params haven't loaded yet.
 */
export function getStagedOrCurrent(
  paramName: string,
  params: ParamInputParams,
): number | null {
  const staged = params.staged.get(paramName);
  if (staged !== undefined) return staged;
  return params.store?.params[paramName]?.value ?? null;
}

/**
 * Safely look up metadata for a parameter.
 * Returns `null` when metadata hasn't loaded or param is absent.
 */
export function getParamMeta(
  paramName: string,
  metadata: ParamMetadataMap | null,
): ParamMeta | null {
  return metadata?.get(paramName) ?? null;
}

/**
 * Format a numeric param value for display.
 * - If metadata has a matching `values[]` entry, returns the enum label.
 * - Appends `unitText` (or `units` fallback) suffix when available.
 * - Falls back to the raw numeric string.
 */
export function formatParamValue(
  value: number,
  meta: ParamMeta | null,
): string {
  if (meta?.values) {
    const match = meta.values.find((v) => v.code === value);
    if (match) return match.label;
  }

  const str = String(value);
  const unit = meta?.unitText ?? meta?.units;
  if (unit) return `${str} ${unit}`;
  return str;
}
