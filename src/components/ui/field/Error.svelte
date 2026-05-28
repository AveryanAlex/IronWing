<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLParagraphElement>, "class"> & {
  message?: string;
  children?: Snippet;
  class?: ClassValue;
};

let { message, children, class: className, ...rest }: Props = $props();

let errorClass = $derived(cn("text-sm font-medium leading-5 text-danger", className));
</script>

{#if message || children}
  <p {...rest} class={errorClass} data-ui-field-error aria-live="polite">
    {#if message}{message}{/if}
    {@render children?.()}
  </p>
{/if}
