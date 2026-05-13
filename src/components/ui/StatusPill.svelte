<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = { tone?: Tone; testId?: string; children: Snippet };

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[color-mix(in_srgb,var(--color-bg-tertiary)_80%,transparent)] text-[var(--color-text-secondary)]",
  info: "bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]",
  success: "bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)] text-[var(--color-success)]",
  warning: "bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]",
  danger: "bg-[color-mix(in_srgb,var(--color-danger)_14%,transparent)] text-[var(--color-danger)]",
};

let { tone = "neutral", testId, children }: Props = $props();

let pillClass = $derived(
  [
    "inline-flex items-center gap-[var(--space-2)] rounded-full px-[10px] py-1 text-[0.78rem] font-semibold",
    toneClasses[tone],
  ].join(" "),
);
</script>

<span class={pillClass} data-tone={tone} data-testid={testId}>{@render children()}</span>
