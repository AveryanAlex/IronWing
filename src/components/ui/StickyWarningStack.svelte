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

<div class="sticky top-0 z-30 flex flex-col gap-2 md:gap-3" data-testid={testId}>
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
    <p class="m-0 px-3 py-2 text-sm text-text-secondary">{hiddenCount} more warning{hiddenCount === 1 ? "" : "s"}</p>
  {/if}
</div>
