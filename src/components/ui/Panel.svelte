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
  neutral: "border-border",
  info: "border-accent/30",
  success: "border-success/30",
  warning: "border-warning/30",
  danger: "border-danger/30",
};

let { tone = "neutral", padded = true, testId, children }: Props = $props();

let panelClass = $derived(
  [
    "rounded-lg border bg-surface-panel text-text-primary",
    padded ? "p-3" : "",
    toneClasses[tone],
  ].join(" "),
);
</script>

<section class={panelClass} data-tone={tone} data-padded={padded || undefined} data-testid={testId}>
  {@render children?.()}
</section>
