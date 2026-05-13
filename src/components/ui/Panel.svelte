<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = {
  tone?: Tone;
  padded?: boolean;
  testId?: string;
  children?: Snippet;
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--color-border)]",
  info: "border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))]",
  success: "border-[color-mix(in_srgb,var(--color-success)_35%,var(--color-border))]",
  warning: "border-[color-mix(in_srgb,var(--color-warning)_35%,var(--color-border))]",
  danger: "border-[color-mix(in_srgb,var(--color-danger)_35%,var(--color-border))]",
};

let { tone = "neutral", padded = true, testId, children }: Props = $props();

let panelClass = $derived(
  [
    "rounded-[var(--radius-md)] border bg-[var(--surface-panel)] text-[var(--color-text-primary)]",
    padded ? "p-[var(--space-3)]" : "",
    toneClasses[tone],
  ].join(" "),
);
</script>

<section class={panelClass} data-tone={tone} data-padded={padded || undefined} data-testid={testId}>
  {@render children?.()}
</section>
