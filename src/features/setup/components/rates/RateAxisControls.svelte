<script lang="ts">
import { Badge } from "../../../../components/ui";
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
    value={control.draftValue}
    min={control.min}
    max={control.max}
    step={control.step}
    unit={control.unit}
    metadata={control.name}
    disabled={disabled || control.readOnly}
    badges={detailBadge}
    inputTestId={`${testIdPrefix}-${control.name}`}
    onValueChange={(value) => {
      if (typeof value === "number") {
        onChange(control.name, value);
      }
    }}
  />
{/snippet}

<SetupParamEditGrid density="comfortable" class={`${distributeControls ? "h-full content-between" : ""} ${className}`}>
  {#each axis.controls as control (control.name)}
    {@render parameterControl(control)}
  {/each}
</SetupParamEditGrid>
