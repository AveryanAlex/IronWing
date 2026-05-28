<script lang="ts">
import { cn } from "../../lib/utils";

type Variant = "default" | "text" | "circle" | "card";

type Props = {
  variant?: Variant;
  class?: string;
  testId?: string;
};

const variantClasses: Record<Variant, string> = {
  default: "h-4 w-full rounded-md",
  text: "h-3 w-full rounded-full",
  circle: "size-10 rounded-full",
  card: "h-28 w-full rounded-lg",
};

let { variant = "default", class: className, testId }: Props = $props();
</script>

<div
  class={cn("animate-pulse bg-bg-tertiary/80", variantClasses[variant], className)}
  data-variant={variant}
  data-testid={testId}
  aria-hidden="true"
></div>
