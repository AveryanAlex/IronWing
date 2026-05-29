<script lang="ts">
import { NumberInput, Slider } from "../../../../components/ui";
import type { RateCurveAxisModel, RateCurveParameterControl } from "../../../../lib/setup/rate-curve-adapters";

type Props = {
  axis: RateCurveAxisModel;
  disabled?: boolean;
  testIdPrefix: string;
  onChange: (name: string, value: number) => void;
  distributeControls?: boolean;
  class?: string;
};

let {
  axis,
  disabled = false,
  testIdPrefix,
  onChange,
  distributeControls = false,
  class: className = "",
}: Props = $props();

let controlsClass = $derived(distributeControls ? "flex h-full min-h-0 flex-col justify-between gap-4" : "space-y-4");

function handleNumberInput(control: RateCurveParameterControl, event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const nextValue = Number(target.value);
  if (Number.isFinite(nextValue)) {
    onChange(control.name, nextValue);
  }
}
</script>

<div class={`rate-axis-settings-card grid min-w-0 rounded-xl border border-border bg-bg-primary/70 p-3 ${className}`}>
  <div class={controlsClass}>
    {#each axis.controls as control (control.name)}
      <div class="grid min-w-0 gap-2">
        <div class="rate-control-header flex min-w-0 flex-col gap-2">
          <div class="min-w-0">
            <label class="text-sm font-medium text-text-primary" for={`rate-control-${control.name}`}>{control.label}</label>
            <p class="mt-0.5 text-xs text-text-secondary">{control.description}</p>
          </div>
          <div class="w-fit max-w-full shrink-0 rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold text-text-primary">
            {control.detail}
          </div>
        </div>

        <div class="rate-control-inputs grid min-w-0 gap-2">
          <Slider
            value={control.draftValue}
            min={control.min}
            max={control.max}
            step={control.step}
            disabled={disabled || control.readOnly}
            ariaLabel={control.label}
            testId={`${testIdPrefix}-${control.name}-slider`}
            onValueChange={(value) => onChange(control.name, value)}
          />
          <NumberInput
            id={`rate-control-${control.name}`}
            value={control.draftValue}
            min={control.min}
            max={control.max}
            step={control.step}
            unit={control.unit ?? undefined}
            disabled={disabled || control.readOnly}
            testId={`${testIdPrefix}-${control.name}`}
            oninput={(event) => handleNumberInput(control, event)}
            onchange={(event) => handleNumberInput(control, event)}
          />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .rate-axis-settings-card {
    container-type: inline-size;
  }

  @container (min-width: 22rem) {
    .rate-control-header {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .rate-control-inputs {
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 12rem);
      align-items: center;
    }
  }
</style>
