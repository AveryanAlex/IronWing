<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  primaryMin?: string;
  primaryMax?: string;
  testId?: string;
  primary: Snippet;
  secondary: Snippet;
};

let { primaryMin = "0", primaryMax = "1fr", testId, primary, secondary }: Props = $props();
</script>

<div class="ui-split" data-testid={testId} style="--split-primary-min: {primaryMin}; --split-primary-max: {primaryMax};">
  <div class="ui-split__primary">{@render primary()}</div>
  <div class="ui-split__secondary">{@render secondary()}</div>
</div>

<style>
.ui-split { display: grid; min-height: 0; gap: var(--workspace-gutter-split); grid-template-columns: minmax(var(--split-primary-min), var(--split-primary-max)) minmax(280px, 360px); }
.ui-split__primary, .ui-split__secondary { min-width: 0; min-height: 0; }
@media (max-width: 1024px) { .ui-split { grid-template-columns: 1fr; } }
</style>
