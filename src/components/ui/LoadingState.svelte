<script lang="ts">
type Props = { label?: string; testId?: string };

let { label = "Loading…", testId }: Props = $props();
</script>

<div
  class="inline-flex items-center gap-2 text-sm text-text-secondary"
  role="status"
  aria-live="polite"
  data-testid={testId}
>
  <span class="ui-loading__dot size-1.5 rounded-full bg-text-muted"></span>
  <span class="ui-loading__dot size-1.5 rounded-full bg-text-muted"></span>
  <span class="ui-loading__dot size-1.5 rounded-full bg-text-muted"></span>
  <span>{label}</span>
</div>

<style>
.ui-loading__dot { animation: ui-loading-pulse 1.1s ease-in-out infinite; }
.ui-loading__dot:nth-child(2) { animation-delay: 0.18s; }
.ui-loading__dot:nth-child(3) { animation-delay: 0.36s; }
@keyframes ui-loading-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>
