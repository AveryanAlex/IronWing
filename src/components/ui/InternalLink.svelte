<script lang="ts">
import { resolve } from "$app/paths";
import type { PathnameWithSearchOrHash } from "$app/types";
import type { Snippet } from "svelte";
import type { HTMLAnchorAttributes } from "svelte/elements";

import { cn } from "../../lib/utils";

type InternalLinkVariant = "inline" | "button" | "card";

type Props = Omit<HTMLAnchorAttributes, "class" | "children" | "href"> & {
  href: PathnameWithSearchOrHash;
  variant?: InternalLinkVariant;
  class?: string;
  testId?: string;
  children?: Snippet;
};

const variantClasses: Record<InternalLinkVariant, string> = {
  inline: "inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline",
  button: "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border-light bg-bg-secondary px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
  card: "flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-secondary p-3 text-sm font-medium text-text-primary transition-colors hover:border-border-light hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
};

let {
  href,
  variant = "inline",
  class: className,
  testId,
  children,
  ...rest
}: Props = $props();

let linkClass = $derived(cn("no-underline", variantClasses[variant], className));
</script>

<a {...rest} class={linkClass} data-testid={testId} href={resolve(href as "/")}>
  {@render children?.()}
</a>
