<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "blocking";
type Density = "default" | "compact" | "comfortable";

type Props = {
  tone?: Tone;
  density?: Density;
  selected?: boolean;
  testId?: string;
  children?: Snippet;
};

const densityClasses: Record<Density, string> = {
  compact: "p-3",
  default: "p-4",
  comfortable: "p-5",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-surface-card",
  info: "border-accent/30 bg-surface-card",
  success: "border-success/30 bg-surface-card",
  warning: "border-warning/30 bg-surface-card",
  danger: "border-danger/30 bg-surface-card",
  blocking: "border-danger/40 bg-danger/10",
};

let { tone = "neutral", density = "default", selected = false, testId, children }: Props = $props();

let cardClass = $derived(
  [
    "rounded-lg border text-text-primary",
    densityClasses[density],
    toneClasses[tone],
    selected ? "ring-2 ring-accent/50" : "",
  ].join(" "),
);
</script>

<div class={cardClass} data-tone={tone} data-density={density} data-selected={selected || undefined} data-testid={testId}>
  {@render children?.()}
</div>
