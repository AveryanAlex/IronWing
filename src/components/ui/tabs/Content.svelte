<script lang="ts">
import type { Snippet } from "svelte";
import { Tabs as Bits } from "bits-ui";
import type { TabsContentProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<TabsContentProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Content {child} class={cn("text-sm text-text-primary focus-visible:outline-none", className)} {...rest}>
  {@render children?.()}
</Bits.Content>
