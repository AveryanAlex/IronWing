<script lang="ts">
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
  class="flex gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--surface-panel)] px-[var(--space-4)] py-[var(--space-3)] data-[severity=info]:[border-color:color-mix(in_srgb,var(--color-accent)_40%,transparent)] data-[severity=info]:[background:color-mix(in_srgb,var(--color-accent)_10%,transparent)] data-[severity=success]:[border-color:color-mix(in_srgb,var(--color-success)_40%,transparent)] data-[severity=success]:[background:color-mix(in_srgb,var(--color-success)_10%,transparent)] data-[severity=warning]:[border-color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] data-[severity=warning]:[background:color-mix(in_srgb,var(--color-warning)_10%,transparent)] data-[severity=danger]:[border-color:color-mix(in_srgb,var(--color-danger)_50%,transparent)] data-[severity=danger]:[background:color-mix(in_srgb,var(--color-danger)_10%,transparent)] data-[severity=blocking]:border-[var(--color-danger)] data-[severity=blocking]:[background:color-mix(in_srgb,var(--color-danger)_14%,transparent)]"
  data-severity={severity}
  role={severity === "danger" || severity === "blocking" ? "alert" : "status"}
  data-testid={testId}
>
  <div class="min-w-0 flex-1">
    {#if source}<span class="text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">{source}</span>{/if}
    <p class="mt-1 font-semibold text-[var(--color-text-primary)]" data-testid={titleTestId}>{title}</p>
    {#if message}<p class="mt-1 text-[0.88rem] text-[var(--color-text-secondary)]" data-testid={messageTestId}>{message}</p>{/if}
    {#if details && details.length > 0}
      <ul class="mt-[var(--space-2)] list-disc pl-[var(--space-4)] text-[0.82rem] text-[var(--color-text-secondary)]">
        {#each details as line (line)}
          <li class="mt-[var(--space-1)] first:mt-0">{line}</li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="flex items-start gap-[var(--space-2)]">
    {#if actionLabel && onAction}
      <button
        class="cursor-pointer rounded-[var(--radius-sm)] border border-current bg-transparent px-[10px] py-1 font-semibold"
        data-testid={actionTestId}
        onclick={onAction}
        type="button"
      >{actionLabel}</button>
    {/if}
    {#if dismissible && onDismiss}
      <button
        class="cursor-pointer border-none bg-transparent text-[1.1rem] text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        aria-label="Dismiss"
        data-testid={dismissTestId}
        onclick={onDismiss}
        type="button"
      >×</button>
    {/if}
  </div>
</div>
