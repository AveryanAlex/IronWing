<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type EyebrowElement = "div" | "h2" | "h3" | "h4" | "p" | "span";
type EyebrowTracking = "wide" | "widest";
type EyebrowTone = "muted" | "secondary" | "primary" | "accent" | "success" | "warning" | "danger";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: EyebrowElement;
  tracking?: EyebrowTracking;
  tone?: EyebrowTone;
  class?: ClassValue;
  testId?: string;
  children?: Snippet;
};

const trackingClasses: Record<EyebrowTracking, string> = {
  wide: "tracking-wide",
  widest: "tracking-widest",
};

const toneClasses: Record<EyebrowTone, string> = {
  muted: "text-text-muted",
  secondary: "text-text-secondary",
  primary: "text-text-primary",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

let {
  as = "p",
  tracking = "wide",
  tone = "muted",
  class: className,
  testId,
  children,
  ...rest
}: Props = $props();

let eyebrowClass = $derived(
  cn("m-0 text-xs font-semibold uppercase", trackingClasses[tracking], toneClasses[tone], className),
);
</script>

<svelte:element this={as} {...rest} class={eyebrowClass} data-testid={testId} data-tone={tone}>
  {@render children?.()}
</svelte:element>
