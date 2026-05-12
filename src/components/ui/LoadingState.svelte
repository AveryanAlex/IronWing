<script lang="ts">
type Props = { label?: string; testId?: string };

let { label = "Loading…", testId }: Props = $props();
</script>

<div class="ui-loading" role="status" aria-live="polite" data-testid={testId}>
  <span class="ui-loading__dot"></span>
  <span class="ui-loading__dot"></span>
  <span class="ui-loading__dot"></span>
  <span class="ui-loading__label">{label}</span>
</div>

<style>
.ui-loading { display: inline-flex; align-items: center; gap: 6px; color: var(--color-text-secondary); font-size: 0.88rem; }
.ui-loading__dot { width: 6px; height: 6px; border-radius: 999px; background: var(--color-text-muted); animation: ui-loading-pulse 1.1s ease-in-out infinite; }
.ui-loading__dot:nth-child(2) { animation-delay: 0.18s; }
.ui-loading__dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes ui-loading-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>
