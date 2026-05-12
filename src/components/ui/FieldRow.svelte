<script lang="ts">
import type { Snippet } from "svelte";

type Layout = "row" | "stacked";

type Props = {
  label: string;
  description?: string;
  htmlFor?: string;
  layout?: Layout;
  testId?: string;
  control: Snippet;
};

let { label, description, htmlFor, layout = "row", testId, control }: Props = $props();
</script>

<div class="ui-field-row" data-layout={layout} data-testid={testId}>
  <div class="ui-field-row__copy">
    <label class="ui-field-row__label" for={htmlFor}>{label}</label>
    {#if description}<p class="ui-field-row__description">{description}</p>{/if}
  </div>
  <div class="ui-field-row__control">{@render control()}</div>
</div>

<style>
.ui-field-row {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
}
.ui-field-row[data-layout="row"]     { grid-template-columns: minmax(0, 1fr) minmax(160px, auto); align-items: center; }
.ui-field-row[data-layout="stacked"] { grid-template-columns: 1fr; }
.ui-field-row__copy { min-width: 0; }
.ui-field-row__label { color: var(--color-text-primary); font-weight: 600; font-size: 0.92rem; }
.ui-field-row__description { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 0.82rem; line-height: 1.45; }
.ui-field-row__control { display: flex; justify-content: flex-end; align-items: center; gap: var(--space-2); }
@media (max-width: 767px) {
  .ui-field-row[data-layout="row"] { grid-template-columns: 1fr; }
  .ui-field-row__control { justify-content: flex-start; }
}
</style>
