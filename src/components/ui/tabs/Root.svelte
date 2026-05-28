<script lang="ts">
import type { Snippet } from "svelte";
import { Tabs as Bits } from "bits-ui";
import type { TabsRootProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<TabsRootProps, "value" | "onValueChange" | "children" | "child" | "class"> & {
  value?: string;
  onValueChange?: (value: string) => void;
  class?: string;
  children?: Snippet;
};

let { value = $bindable(), onValueChange, class: className, children, ...rest }: Props = $props();

function handleValueChange(nextValue: string) {
  value = nextValue;
  onValueChange?.(nextValue);
}
</script>

<Bits.Root class={cn("grid gap-3", className)} {value} onValueChange={handleValueChange} {...rest}>
  {@render children?.()}
</Bits.Root>
