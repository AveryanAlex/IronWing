<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "accent" | "muted" | "success" | "warning" | "danger";

type Props = {
  tone?: Tone;
  testId?: string;
  children: Snippet;
};

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent/10 text-accent",
  muted: "bg-bg-secondary text-text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

let { tone = "accent", testId, children }: Props = $props();

let pillClass = $derived([
  "rounded-full px-2 py-0.5 text-[10px] font-medium",
  toneClasses[tone],
].join(" "));
</script>

<span class={pillClass} data-tone={tone} data-testid={testId}>{@render children()}</span>
