<script lang="ts">
import type { ClassValue } from "clsx";
import { GripVertical } from "lucide-svelte";
import type { HTMLButtonAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type Size = "xs" | "sm" | "default";

type Props = Omit<HTMLButtonAttributes, "class" | "children" | "type" | "size"> & {
  ariaLabel: string;
  size?: Size;
  attach?: unknown;
  class?: ClassValue;
  testId?: string;
};

const sizeClasses: Record<Size, string> = {
  xs: "p-0.5 [&>svg]:size-3.5",
  sm: "p-1.5 [&>svg]:size-4",
  default: "p-2 [&>svg]:size-4",
};

let { ariaLabel, size = "sm", attach, class: className, testId, ...rest }: Props = $props();

let handleClass = $derived(
  cn(
    "cursor-grab rounded text-text-muted/70 transition-colors hover:bg-bg-tertiary hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40",
    sizeClasses[size],
    className,
  ),
);
</script>

{#if attach}
  <button {...rest} class={handleClass} aria-label={ariaLabel} data-testid={testId} title={rest.title ?? "Drag to reorder"} type="button" {@attach attach}>
    <GripVertical aria-hidden="true" />
  </button>
{:else}
  <button {...rest} class={handleClass} aria-label={ariaLabel} data-testid={testId} title={rest.title ?? "Drag to reorder"} type="button">
    <GripVertical aria-hidden="true" />
  </button>
{/if}
