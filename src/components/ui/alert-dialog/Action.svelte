<script lang="ts">
import type { Snippet } from "svelte";
import { AlertDialog as Bits } from "bits-ui";
import type { AlertDialogActionProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<AlertDialogActionProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Action
  {child}
  class={cn(
    "inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-accent px-3 text-sm font-medium text-bg-primary transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    className,
  )}
  {...rest}
>
  {@render children?.()}
</Bits.Action>
