<script lang="ts">
import type { Snippet } from "svelte";

type Variant = "default" | "primary" | "flat";

type Props = {
  variant?: Variant;
  class?: string;
  testId?: string;
  dataStep?: string;
  children: Snippet;
};

const variantClasses: Record<Variant, string> = {
  default: "border-border bg-bg-tertiary/50",
  primary: "border-border bg-bg-primary/80",
  flat: "border-border/50 bg-bg-secondary/40",
};

let { variant = "default", class: className = "", testId, dataStep, children }: Props = $props();

let cardClass = $derived([
  "rounded-lg border p-4",
  variantClasses[variant],
  className,
].filter(Boolean).join(" "));
</script>

<div class={cardClass} data-step={dataStep} data-testid={testId}>
  {@render children()}
</div>
