<script lang="ts">
import type { Snippet } from "svelte";
import { Popover as Bits } from "bits-ui";
import type { PopoverContentProps, PopoverRootProps } from "bits-ui";
import { cn } from "../../lib/utils";

type Props = Omit<PopoverRootProps, "open" | "onOpenChange" | "children"> &
  Pick<PopoverContentProps, "align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding" | "avoidCollisions"> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    class?: string;
    triggerClass?: string;
    contentClass?: string;
    trigger: Snippet;
    content: Snippet;
  };

let {
  open = $bindable(false),
  onOpenChange,
  align = "center",
  side = "bottom",
  sideOffset = 8,
  alignOffset,
  collisionPadding,
  avoidCollisions,
  class: className,
  triggerClass,
  contentClass,
  trigger,
  content,
  ...rest
}: Props = $props();

function handleOpenChange(nextOpen: boolean) {
  open = nextOpen;
  onOpenChange?.(nextOpen);
}
</script>

<Bits.Root {open} onOpenChange={handleOpenChange} {...rest}>
  <div class={cn("inline-flex", className)}>
    <Bits.Trigger
      class={cn(
        "inline-flex cursor-pointer items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
        triggerClass,
      )}
    >
      {@render trigger()}
    </Bits.Trigger>
  </div>
  <Bits.Portal>
    <Bits.Content
      class={cn(
        "z-[70] max-w-sm rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-primary shadow-xl shadow-black/35 focus-visible:outline-none",
        contentClass,
      )}
      {align}
      {side}
      {sideOffset}
      {alignOffset}
      {collisionPadding}
      {avoidCollisions}
    >
      {@render content()}
    </Bits.Content>
  </Bits.Portal>
</Bits.Root>
