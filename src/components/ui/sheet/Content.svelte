<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogContentProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Side = "top" | "right" | "bottom" | "left";

type Props = Omit<DialogContentProps, "children"> & {
  class?: string;
  overlayClass?: string;
  side?: Side;
  showClose?: boolean;
  closeLabel?: string;
  children?: Snippet;
};

const sideClasses: Record<Side, string> = {
  top: "inset-x-0 top-0 max-h-[85dvh] rounded-b-xl border-b",
  right: "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l sm:max-w-md",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t",
  left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r sm:max-w-md",
};

let {
  class: className,
  overlayClass,
  side = "right",
  showClose = true,
  closeLabel = "Close sheet",
  children,
  ...rest
}: Props = $props();
</script>

<Bits.Portal>
  <Bits.Overlay class={cn("fixed inset-0 z-50 bg-black/70", overlayClass)} />
  <Bits.Content
    class={cn(
      "fixed z-[60] flex flex-col overflow-auto border-border bg-bg-secondary p-5 text-text-primary shadow-2xl shadow-black/40 focus-visible:outline-none",
      sideClasses[side],
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
