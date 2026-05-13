<script lang="ts">
import { X } from "lucide-svelte";

type Severity = "info" | "success" | "warning" | "danger" | "blocking";

type Props = {
  title: string;
  message?: string;
  severity?: Severity;
  source?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  details?: ReadonlyArray<string>;
  testId?: string;
  titleTestId?: string;
  messageTestId?: string;
  actionTestId?: string;
  dismissTestId?: string;
};

const severityClasses: Record<Severity, string> = {
  info: "border-accent/40 bg-accent/10",
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  danger: "border-danger/40 bg-danger/10",
  blocking: "border-danger/50 bg-danger/15",
};

let {
  title,
  message,
  severity = "info",
  source,
  actionLabel,
  onAction,
  dismissible = false,
  onDismiss,
  details,
  testId,
  titleTestId,
  messageTestId,
  actionTestId,
  dismissTestId,
}: Props = $props();
</script>

<div
  class={`flex gap-3 rounded-lg border px-4 py-3 ${severityClasses[severity]}`}
  data-severity={severity}
  role={severity === "danger" || severity === "blocking" ? "alert" : "status"}
  data-testid={testId}
>
  <div class="min-w-0 flex-1">
    {#if source}<span class="text-xs font-semibold uppercase tracking-wide text-text-muted">{source}</span>{/if}
    <p class="ui-banner__title mt-1 text-sm font-semibold text-text-primary" data-testid={titleTestId}>{title}</p>
    {#if message}<p class="mt-1 text-sm leading-5 text-text-secondary" data-testid={messageTestId}>{message}</p>{/if}
    {#if details && details.length > 0}
      <ul class="mt-2 list-disc pl-4 text-sm leading-5 text-text-secondary">
        {#each details as line (line)}
          <li class="mt-1 first:mt-0">{line}</li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="flex items-start gap-2">
    {#if actionLabel && onAction}
      <button
        class="cursor-pointer rounded-md border border-current bg-transparent px-2.5 py-1 text-xs font-medium"
        data-testid={actionTestId}
        onclick={onAction}
        type="button"
      >{actionLabel}</button>
    {/if}
    {#if dismissible && onDismiss}
      <button
        class="inline-flex cursor-pointer items-center justify-center border-none bg-transparent text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        aria-label="Dismiss"
        data-testid={dismissTestId}
        onclick={onDismiss}
        type="button"
      ><X aria-hidden="true" size={14} /></button>
    {/if}
  </div>
</div>
