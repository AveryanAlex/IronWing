<script lang="ts">
import { Button, Card, Eyebrow, MonoValue } from "../../../../components/ui";
import { formatParamValue } from "../../../../lib/params/parameter-item-model";
import type { RateCurveParameterControl } from "../../../../lib/setup/rate-curve-adapters";

type Props = {
  controls: RateCurveParameterControl[];
  disabled?: boolean;
  stageTestId?: string;
  resetTestId?: string;
  onStage: () => void;
  onReset: () => void;
};

let {
  controls,
  disabled = false,
  stageTestId,
  resetTestId,
  onStage,
  onReset,
}: Props = $props();

let changedControls = $derived(controls.filter((control) => control.changed));
let changedCount = $derived(changedControls.length);

function displayControlValue(control: RateCurveParameterControl, value: number): string {
  return formatParamValue(value, control.step);
}
</script>

<Card.Root surface="default" density="compact" tone="info" appearance="solid">
  <div class="flex items-start justify-between gap-3 max-sm:flex-col">
    <div>
      <Eyebrow>Staged native parameters</Eyebrow>
      <p class="mt-1 text-sm text-text-secondary">
        {changedCount === 0
          ? "No native rate parameter changes in the draft."
          : `${changedCount} parameter${changedCount === 1 ? "" : "s"} will be staged for review.`}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <Button size="sm" tone="accent" variant="soft" disabled={disabled || changedCount === 0} onclick={onStage} testId={stageTestId}>
        Stage rates
      </Button>
      <Button size="sm" tone="neutral" variant="ghost" disabled={disabled} onclick={onReset} testId={resetTestId}>
        Reset draft
      </Button>
    </div>
  </div>

  <div class="mt-3 grid gap-1">
    {#each controls as control (control.name)}
      <div class="grid gap-2 rounded-lg px-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)_auto] sm:items-center {control.changed ? 'bg-accent/10 text-text-primary' : 'text-text-muted'}">
        <span class="font-medium">{control.label}</span>
        <span class="text-text-secondary">{displayControlValue(control, control.currentValue)} → {displayControlValue(control, control.draftValue)}</span>
        <MonoValue size="xs" tone="muted" wrap>{control.name}</MonoValue>
      </div>
    {/each}
  </div>
</Card.Root>
