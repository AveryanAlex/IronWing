<script lang="ts">
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogDescriptionProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<DialogDescriptionProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Description {child} class={cn("text-sm leading-5 text-text-secondary", className)} {...rest}>
  {@render children?.()}
</Bits.Description>
