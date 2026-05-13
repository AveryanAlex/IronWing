<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = { tone?: Tone; testId?: string; children: Snippet };

const toneClasses: Record<Tone, string> = {
  neutral: "border-border-light bg-bg-secondary text-text-secondary",
  info: "border-accent/30 bg-accent/10 text-accent",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

let { tone = "neutral", testId, children }: Props = $props();

let badgeClass = $derived(
  [
    "inline-flex min-h-5 items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
    toneClasses[tone],
  ].join(" "),
);
</script>

<span class={badgeClass} data-tone={tone} data-testid={testId}>{@render children()}</span>
