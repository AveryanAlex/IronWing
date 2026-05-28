<script lang="ts">
import type { Snippet } from "svelte";
import { Collapsible as Bits } from "bits-ui";
import type { CollapsibleContentProps, CollapsibleRootProps } from "bits-ui";
import { cn } from "../../lib/utils";

type Props = Omit<CollapsibleRootProps, "open" | "onOpenChange" | "children" | "child" | "class"> &
  Pick<CollapsibleContentProps, "forceMount" | "hiddenUntilFound"> & {
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
  disabled,
  forceMount,
  hiddenUntilFound,
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

<Bits.Root class={cn("grid gap-2", className)} {open} onOpenChange={handleOpenChange} {disabled} {...rest}>
  <Bits.Trigger
    class={cn(
      "inline-flex cursor-pointer items-center rounded-md text-left text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
      triggerClass,
    )}
  >
    {@render trigger()}
  </Bits.Trigger>
  <Bits.Content class={cn("text-sm text-text-secondary", contentClass)} {forceMount} {hiddenUntilFound}>
    {@render content()}
  </Bits.Content>
</Bits.Root>
