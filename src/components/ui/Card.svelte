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
  compact: "p-[var(--space-3)]",
  default: "p-[var(--space-4)]",
  comfortable: "p-[var(--space-5)]",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--color-border)] bg-[var(--surface-card)]",
  info: "border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] bg-[var(--surface-card)]",
  success: "border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))] bg-[var(--surface-card)]",
  warning: "border-[color-mix(in_srgb,var(--color-warning)_35%,var(--color-border))] bg-[var(--surface-card)]",
  danger: "border-[color-mix(in_srgb,var(--color-danger)_35%,var(--color-border))] bg-[var(--surface-card)]",
  blocking: "border-[var(--color-danger)] bg-[color-mix(in_srgb,var(--color-danger)_8%,var(--surface-card))]",
};

let { tone = "neutral", density = "default", selected = false, testId, children }: Props = $props();

let cardClass = $derived(
  [
    "rounded-[var(--radius-lg)] border text-[var(--color-text-primary)]",
    densityClasses[density],
    toneClasses[tone],
    selected ? "shadow-[0_0_0_2px_var(--color-accent)]" : "",
  ].join(" "),
);
</script>

<div class={cardClass} data-tone={tone} data-density={density} data-selected={selected || undefined} data-testid={testId}>
  {@render children?.()}
</div>
