<script lang="ts">
import type { Snippet } from "svelte";
import { Tabs as Bits } from "bits-ui";
import type { TabsTriggerProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<TabsTriggerProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Trigger
  {child}
  class={cn(
    "inline-flex h-7 cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:bg-bg-tertiary data-[state=active]:text-text-primary data-[state=active]:shadow-sm",
    className,
  )}
  {...rest}
>
  {@render children?.()}
</Bits.Trigger>
