<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Variant = "info" | "success" | "warning" | "danger" | "blocking";
type Density = "compact" | "default" | "comfortable";
type Appearance = "solid" | "dashed";
type Layout = "row" | "stacked";

type Props = {
  variant?: Variant;
  density?: Density;
  appearance?: Appearance;
  layout?: Layout;
  shadow?: boolean;
  title?: string | Snippet;
  description?: string | Snippet;
  icon?: Snippet;
  action?: Snippet;
  children?: Snippet;
  role?: "status" | "alert";
  class?: ClassValue;
  testId?: string;
  titleTestId?: string;
  descriptionTestId?: string;
};

const variantClasses: Record<Variant, string> = {
  info: "border-accent/35 bg-accent/10 text-accent",
  success: "border-success/35 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-danger/35 bg-danger/10 text-danger",
  blocking: "border-danger/50 bg-danger/15 text-danger ring-1 ring-danger/20",
};

const densityClasses: Record<Density, string> = {
  compact: "p-3",
  default: "p-4",
  comfortable: "p-5",
};

const layoutClasses: Record<Layout, string> = {
  row: "flex gap-3",
  stacked: "flex flex-col gap-3",
};

let {
  variant = "info",
  density = "default",
  appearance = "solid",
  layout = "row",
  shadow = true,
  title,
  description,
  icon,
  action,
  children,
  role,
  class: className,
  testId,
  titleTestId,
  descriptionTestId,
}: Props = $props();

let alertRole = $derived(role ?? (variant === "danger" || variant === "blocking" ? "alert" : "status"));
let titleSnippet = $derived(typeof title === "function" ? title : undefined);
let titleText = $derived(typeof title === "string" ? title : undefined);
let descriptionSnippet = $derived(typeof description === "function" ? description : undefined);
let descriptionText = $derived(typeof description === "string" ? description : undefined);
let alertClass = $derived(
  cn(
    "rounded-lg border",
    layoutClasses[layout],
    densityClasses[density],
    shadow && "shadow-sm",
    appearance === "dashed" && "border-dashed",
    variantClasses[variant],
    className,
  ),
);
</script>

<div class={alertClass} data-appearance={appearance} data-density={density} data-variant={variant} role={alertRole} data-testid={testId}>
  {#if icon}
    <div class="mt-0.5 flex shrink-0 text-current" aria-hidden="true">{@render icon()}</div>
  {/if}

  <div class="min-w-0 flex-1 text-text-secondary">
    {#if titleSnippet || titleText}
      <div class="text-sm font-semibold text-text-primary" data-testid={titleTestId}>
        {#if titleSnippet}
          {@render titleSnippet()}
        {:else}
          {titleText}
        {/if}
      </div>
    {/if}

    {#if descriptionSnippet || descriptionText}
      <div class="mt-1 text-sm leading-5" data-testid={descriptionTestId}>
        {#if descriptionSnippet}
          {@render descriptionSnippet()}
        {:else}
          {descriptionText}
        {/if}
      </div>
    {/if}

    {@render children?.()}
  </div>

  {#if action}
    <div class="shrink-0">{@render action()}</div>
  {/if}
</div>
