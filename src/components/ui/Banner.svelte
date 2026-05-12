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

<div class="ui-banner" data-severity={severity} role={severity === "danger" || severity === "blocking" ? "alert" : "status"} data-testid={testId}>
  <div class="ui-banner__body">
    {#if source}<span class="ui-banner__source">{source}</span>{/if}
    <p class="ui-banner__title" data-testid={titleTestId}>{title}</p>
    {#if message}<p class="ui-banner__message" data-testid={messageTestId}>{message}</p>{/if}
    {#if details && details.length > 0}
      <ul class="ui-banner__details">
        {#each details as line (line)}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="ui-banner__actions">
    {#if actionLabel && onAction}
      <button class="ui-banner__action" data-testid={actionTestId} onclick={onAction} type="button">{actionLabel}</button>
    {/if}
    {#if dismissible && onDismiss}
      <button class="ui-banner__close" aria-label="Dismiss" data-testid={dismissTestId} onclick={onDismiss} type="button">×</button>
    {/if}
  </div>
</div>

<style>
.ui-banner {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--surface-panel);
}
.ui-banner[data-severity="info"]     { border-color: color-mix(in srgb, var(--color-accent) 40%, transparent);  background: color-mix(in srgb, var(--color-accent) 10%, transparent); }
.ui-banner[data-severity="success"]  { border-color: color-mix(in srgb, var(--color-success) 40%, transparent); background: color-mix(in srgb, var(--color-success) 10%, transparent); }
.ui-banner[data-severity="warning"]  { border-color: color-mix(in srgb, var(--color-warning) 40%, transparent); background: color-mix(in srgb, var(--color-warning) 10%, transparent); }
.ui-banner[data-severity="danger"]   { border-color: color-mix(in srgb, var(--color-danger) 50%, transparent);  background: color-mix(in srgb, var(--color-danger) 10%, transparent); }
.ui-banner[data-severity="blocking"] { border-color: var(--color-danger); background: color-mix(in srgb, var(--color-danger) 14%, transparent); }
.ui-banner__body { flex: 1; min-width: 0; }
.ui-banner__source { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-muted); }
.ui-banner__title { margin: 4px 0 0; font-weight: 600; color: var(--color-text-primary); }
.ui-banner__message { margin: 4px 0 0; font-size: 0.88rem; color: var(--color-text-secondary); }
.ui-banner__details {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-4);
  list-style: disc;
  color: var(--color-text-secondary);
  font-size: 0.82rem;
}
.ui-banner__details li { margin-top: var(--space-1); }
.ui-banner__details li:first-child { margin-top: 0; }
.ui-banner__actions { display: flex; align-items: flex-start; gap: var(--space-2); }
.ui-banner__action { border: 1px solid currentColor; background: transparent; color: inherit; border-radius: var(--radius-sm); padding: 4px 10px; font-weight: 600; cursor: pointer; }
.ui-banner__close { background: transparent; border: none; color: var(--color-text-secondary); font-size: 1.1rem; cursor: pointer; }
.ui-banner__close:focus-visible { outline: 2px solid var(--color-accent); }
</style>
