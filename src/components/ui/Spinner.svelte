<script lang="ts">
import { cn } from "../../lib/utils";

type Size = "sm" | "default" | "lg";

type Props = {
  size?: Size;
  label?: string;
  showLabel?: boolean;
  decorative?: boolean;
  class?: string;
  testId?: string;
};

const sizeClasses: Record<Size, string> = {
  sm: "size-4",
  default: "size-5",
  lg: "size-6",
};

let { size = "default", label = "Loading", showLabel = false, decorative = false, class: className, testId }: Props = $props();
</script>

<span
  class={cn("inline-flex items-center gap-2 text-text-secondary", className)}
  role={decorative ? "presentation" : "status"}
  aria-hidden={decorative || undefined}
  data-testid={testId}
>
  <svg
    class={cn("animate-spin text-current", sizeClasses[size])}
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
    <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"></path>
  </svg>
  {#if !decorative}
    <span class={showLabel ? "text-sm" : "sr-only"}>{label}</span>
  {/if}
</span>
