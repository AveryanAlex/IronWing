<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLParagraphElement>, "class"> & {
  children?: Snippet;
  class?: ClassValue;
};

let { children, class: className, ...rest }: Props = $props();

let descriptionClass = $derived(cn("text-sm leading-5 text-text-secondary", className));
</script>

<p {...rest} class={descriptionClass} data-ui-field-description>
  {@render children?.()}
</p>
