<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = HTMLAttributes<HTMLElement> & {
  class?: string;
  children?: Snippet;
};

let { class: className, children, ...rest }: Props = $props();
</script>

<footer class={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...rest}>
  {@render children?.()}
</footer>
