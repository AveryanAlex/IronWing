<script lang="ts">
import type { Snippet } from "svelte";
import { AlertDialog as Bits } from "bits-ui";
import type { AlertDialogTriggerProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<AlertDialogTriggerProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Trigger
  {child}
  class={cn(
    "inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-light bg-bg-secondary px-3 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )}
  {...rest}
>
  {@render children?.()}
</Bits.Trigger>
