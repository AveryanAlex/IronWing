<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class"> & {
  invalid?: boolean;
  children?: Snippet;
  class?: ClassValue;
};

let { invalid = false, children, class: className, "aria-invalid": ariaInvalid, ...rest }: Props = $props();

let rootClass = $derived(cn("grid gap-2", className));
</script>

<div {...rest} class={rootClass} data-ui-field data-invalid={invalid ? "true" : undefined} aria-invalid={invalid ? "true" : ariaInvalid}>
  {@render children?.()}
</div>
