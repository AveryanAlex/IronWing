<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogContentProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Size = "sm" | "md" | "lg" | "xl" | "full";

type Props = Omit<DialogContentProps, "children"> & {
  class?: string;
  overlayClass?: string;
  size?: Size;
  showClose?: boolean;
  closeLabel?: string;
  children?: Snippet;
};

const sizeClasses: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)]",
};

let {
  class: className,
  overlayClass,
  size = "md",
  showClose = true,
  closeLabel = "Close dialog",
  children,
  ...rest
}: Props = $props();
</script>

<Bits.Portal>
  <Bits.Overlay class={cn("fixed inset-0 z-50 bg-black/70", overlayClass)} />
  <Bits.Content
    class={cn(
      "fixed left-1/2 top-1/2 z-[60] grid max-h-[85dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-auto rounded-xl border border-border bg-bg-secondary p-5 text-text-primary shadow-2xl shadow-black/40 focus-visible:outline-none sm:w-full",
      sizeClasses[size],
      className,
    )}
    {...rest}
  >
    {@render children?.()}
    {#if showClose}
      <Bits.Close
        class="absolute right-3 top-3 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label={closeLabel}
      >
        <X aria-hidden="true" size={16} />
      </Bits.Close>
    {/if}
  </Bits.Content>
</Bits.Portal>
