<script lang="ts">
import type { Snippet } from "svelte";
import { AlertDialog as Bits } from "bits-ui";
import type { AlertDialogDescriptionProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<AlertDialogDescriptionProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Description {child} class={cn("text-sm leading-5 text-text-secondary", className)} {...rest}>
  {@render children?.()}
</Bits.Description>
