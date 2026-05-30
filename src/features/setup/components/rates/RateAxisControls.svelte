<script lang="ts">
import { Badge, NumberInput, Slider } from "../../../../components/ui";
import type { RateCurveAxisModel, RateCurveParameterControl } from "../../../../lib/setup/rate-curve-adapters";
import SetupParamEditCard from "../../shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../shared/SetupParamEditGrid.svelte";

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

function handleNumberInput(control: RateCurveParameterControl, event: Event) {
  const target = event.currentTarget as HTMLInputElement;
  const nextValue = Number(target.value);
  if (Number.isFinite(nextValue)) {
    onChange(control.name, nextValue);
  }
}
</script>

{#snippet parameterControl(control: RateCurveParameterControl)}
  {#snippet detailBadge()}
    <Badge variant="muted" size="sm" case="normal" shape="pill">{control.detail}</Badge>
  {/snippet}

  <SetupParamEditCard
    item={control.item}
    inputId={`rate-control-${control.name}`}
    label={control.label}
    description={control.description}
    type="custom"
    min={control.min}
    max={control.max}
    step={control.step}
    unit={control.unit}
    metadata={control.name}
    {disabled}
    badges={detailBadge}
    class="[container-type:inline-size]"
  >
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
  </SetupParamEditCard>
{/snippet}

<SetupParamEditGrid density="comfortable" class={`${distributeControls ? "h-full content-between" : ""} ${className}`}>
  {#each axis.controls as control (control.name)}
    {@render parameterControl(control)}
  {/each}
</SetupParamEditGrid>

<style>
  @container (min-width: 22rem) {
    .rate-control-inputs {
      grid-template-columns: minmax(0, 1fr) minmax(9rem, 12rem);
      align-items: center;
    }
  }
</style>
