<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogCloseProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<DialogCloseProps, "children"> & {
  class?: string;
  ariaLabel?: string;
  children?: Snippet;
};

let { class: className, ariaLabel = "Close sheet", children, child, ...rest }: Props = $props();
</script>

<Bits.Close
  {child}
  class={cn(
    "inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-light bg-bg-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )}
  aria-label={ariaLabel}
  {...rest}
>
  {#if children}
    {@render children()}
  {:else}
    <X aria-hidden="true" size={16} />
  {/if}
</Bits.Close>
