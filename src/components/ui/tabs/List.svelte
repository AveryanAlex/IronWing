<script lang="ts">
import type { Snippet } from "svelte";
import { Tabs as Bits } from "bits-ui";
import type { TabsListProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<TabsListProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.List
  {child}
  class={cn("inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-bg-secondary p-1", className)}
  {...rest}
>
  {@render children?.()}
</Bits.List>
