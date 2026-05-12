<script lang="ts">
import { sortBySeverity, type Warning } from "../../lib/warnings/warning-model";
import Banner from "./Banner.svelte";

type Props = {
  warnings: ReadonlyArray<Warning>;
  maxVisible?: number;
  testId?: string;
};

let { warnings, maxVisible = 4, testId }: Props = $props();

let sorted = $derived(sortBySeverity(warnings));
let visible = $derived(sorted.slice(0, maxVisible));
let hiddenCount = $derived(Math.max(0, sorted.length - maxVisible));
</script>

<div class="ui-warning-stack" data-testid={testId}>
  {#each visible as w (w.id)}
    <Banner
      title={w.title}
      message={w.message}
      severity={w.severity}
      source={w.source}
      actionLabel={w.actionLabel}
      onAction={w.onAction}
      dismissible={w.dismissible}
      onDismiss={w.onDismiss}
      details={w.details}
      testId={w.testId}
      actionTestId={w.actionTestId}
      dismissTestId={w.dismissTestId}
    />
  {/each}
  {#if hiddenCount > 0}
    <p class="ui-warning-stack__overflow">{hiddenCount} more warning{hiddenCount === 1 ? "" : "s"}</p>
  {/if}
</div>

<style>
.ui-warning-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  position: sticky;
  top: 0;
  z-index: 30;
}
.ui-warning-stack__overflow {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-secondary);
  font-size: 0.86rem;
}
@media (max-width: 767px) {
  .ui-warning-stack { gap: var(--space-1); }
}
</style>
