<script lang="ts">
import type { Snippet } from "svelte";
import { Dialog as Bits } from "bits-ui";
import type { DialogTitleProps } from "bits-ui";
import { cn } from "../../../lib/utils";

type Props = Omit<DialogTitleProps, "children"> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, child, ...rest }: Props = $props();
</script>

<Bits.Title {child} class={cn("text-base font-semibold leading-none tracking-tight text-text-primary", className)} {...rest}>
  {@render children?.()}
</Bits.Title>
