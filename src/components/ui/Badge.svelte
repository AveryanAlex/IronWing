<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = { tone?: Tone; testId?: string; children: Snippet };

const toneClasses: Record<Tone, string> = {
  neutral: "text-[var(--color-text-secondary)]",
  info: "border-[color-mix(in_srgb,var(--color-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]",
  success: "border-[color-mix(in_srgb,var(--color-success)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]",
  warning: "border-[color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]",
  danger: "border-[color-mix(in_srgb,var(--color-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]",
};

let { tone = "neutral", testId, children }: Props = $props();

let badgeClass = $derived(
  [
    "inline-flex min-h-[22px] items-center rounded-[var(--radius-sm)] border border-[var(--color-border-light)] px-[6px] text-[0.68rem] font-bold tracking-[0.1em] uppercase",
    toneClasses[tone],
  ].join(" "),
);
</script>

<span class={badgeClass} data-tone={tone} data-testid={testId}>{@render children()}</span>
