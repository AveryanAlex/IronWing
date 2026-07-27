<script lang="ts">
import { GripVertical } from "lucide-svelte";
import type { HTMLButtonAttributes } from "svelte/elements";

import { Button } from "../../../../components/ui";

type Props = Omit<HTMLButtonAttributes, "aria-label" | "class" | "disabled" | "style" | "title"> & {
  label: string;
  paramSummary: string;
  mode: "grid" | "library";
  ariaLabel: string;
  disabled?: boolean;
  canDrag?: boolean;
  dragging?: boolean;
  preview?: boolean;
  staged?: boolean;
  warning?: boolean;
  style?: string;
  testId?: string;
};

let {
  label,
  paramSummary,
  mode,
  ariaLabel,
  disabled = false,
  canDrag = true,
  dragging = false,
  preview = false,
  staged = false,
  warning = false,
  style,
  testId,
  ...rest
}: Props = $props();
</script>

<Button
  {...rest}
  variant="bare"
  class={[
    "osd-item-chip min-w-0 overflow-hidden rounded-md border font-mono text-xs font-semibold shadow-sm transition",
    mode === "grid"
      ? "absolute h-auto min-h-0 justify-start px-1 py-0 text-left touch-none"
      : "relative flex min-h-9 w-full touch-pan-y items-center justify-between gap-2 px-2.5 py-2 text-left",
    disabled
      ? "cursor-not-allowed border-border bg-bg-secondary text-text-muted opacity-60"
      : canDrag
        ? "cursor-grab border-accent/50 bg-accent/15 text-text-primary hover:border-accent active:cursor-grabbing"
        : "cursor-pointer border-accent/40 bg-accent/10 text-text-primary hover:border-accent",
    warning && "border-warning/70 bg-warning/15",
    staged && "ring-1 ring-accent/50",
    dragging && "opacity-55 ring-2 ring-accent",
    preview && "pointer-events-none z-20 border-accent bg-accent/25 ring-2 ring-accent/60",
  ].filter(Boolean).join(" ")}
  ariaLabel={ariaLabel}
  data-mode={mode}
  {testId}
  {disabled}
  {style}
  title={`${label} · ${paramSummary}`}
>
  <span class="truncate">{label}</span>
  {#if mode === "library" && canDrag}
    <span
      class="inline-flex shrink-0 touch-none items-center text-text-muted"
      data-osd-drag-handle
      title="Drag onto the OSD grid"
    >
      <GripVertical aria-hidden="true" size={14} />
    </span>
  {/if}
</Button>
