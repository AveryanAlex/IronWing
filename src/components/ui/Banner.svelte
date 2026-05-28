<script lang="ts">
import { X } from "lucide-svelte";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Severity = "info" | "success" | "warning" | "danger" | "blocking";

type Props = {
  title: string | Snippet;
  message?: string | Snippet;
  description?: string | Snippet;
  icon?: Snippet;
  action?: Snippet;
  children?: Snippet;
  severity?: Severity;
  variant?: Severity;
  source?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  details?: ReadonlyArray<string>;
  role?: "status" | "alert";
  class?: string;
  testId?: string;
  titleTestId?: string;
  messageTestId?: string;
  actionTestId?: string;
  dismissTestId?: string;
};

const severityClasses: Record<Severity, string> = {
  info: "border-accent/35 bg-accent/10 text-accent",
  success: "border-success/35 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-danger/35 bg-danger/10 text-danger",
  blocking: "border-danger/50 bg-danger/15 text-danger ring-1 ring-danger/20",
};

let {
  title,
  message,
  description,
  icon,
  action,
  children,
  severity = "info",
  variant,
  source,
  actionLabel,
  onAction,
  dismissible = false,
  onDismiss,
  details,
  role,
  class: className,
  testId,
  titleTestId,
  messageTestId,
  actionTestId,
  dismissTestId,
}: Props = $props();

let effectiveSeverity = $derived(variant ?? severity);
let effectiveRole = $derived(role ?? (effectiveSeverity === "danger" || effectiveSeverity === "blocking" ? "alert" : "status"));
let descriptionContent = $derived(description ?? message);
let titleSnippet = $derived(typeof title === "function" ? title : undefined);
let titleText = $derived(typeof title === "string" ? title : undefined);
let descriptionSnippet = $derived(typeof descriptionContent === "function" ? descriptionContent : undefined);
let descriptionText = $derived(typeof descriptionContent === "string" ? descriptionContent : undefined);
let titleClass = $derived(cn("ui-banner__title text-sm font-semibold text-text-primary empty:hidden", source && "mt-1"));

let bannerClass = $derived(
  cn("flex gap-3 rounded-lg border px-4 py-3 shadow-sm", severityClasses[effectiveSeverity], className),
);
</script>

<div
  class={bannerClass}
  data-severity={effectiveSeverity}
  role={effectiveRole}
  data-testid={testId}
>
  {#if icon}
    <div class="mt-0.5 flex shrink-0 text-current" aria-hidden="true">{@render icon()}</div>
  {/if}
  <div class="min-w-0 flex-1">
    {#if source}<span class="text-xs font-semibold uppercase tracking-wide text-text-muted">{source}</span>{/if}
    <div class={titleClass} data-testid={titleTestId}>
      {#if titleSnippet}
        {@render titleSnippet()}
      {:else}
        {titleText}
      {/if}
    </div>
    {#if descriptionSnippet || descriptionText}
      <div class="mt-1 text-sm leading-5 text-text-secondary" data-testid={messageTestId}>
        {#if descriptionSnippet}
          {@render descriptionSnippet()}
        {:else}
          {descriptionText}
        {/if}
      </div>
    {/if}
    {#if details && details.length > 0}
      <ul class="mt-2 list-disc pl-4 text-sm leading-5 text-text-secondary">
        {#each details as line (line)}
          <li class="mt-1 first:mt-0">{line}</li>
        {/each}
      </ul>
    {/if}
    {@render children?.()}
  </div>
  <div class="flex items-start gap-2">
    {#if action}
      <div class="shrink-0">{@render action()}</div>
    {:else if actionLabel && onAction}
      <button
        class="inline-flex min-h-7 cursor-pointer items-center rounded-md border border-current bg-transparent px-2.5 py-1 text-xs font-medium text-current transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        data-testid={actionTestId}
        onclick={onAction}
        type="button"
      >{actionLabel}</button>
    {/if}
    {#if dismissible && onDismiss}
      <button
        class="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label="Dismiss"
        data-testid={dismissTestId}
        onclick={onDismiss}
        type="button"
      ><X aria-hidden="true" size={14} /></button>
    {/if}
  </div>
</div>
