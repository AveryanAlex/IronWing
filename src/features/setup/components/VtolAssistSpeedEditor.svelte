<script lang="ts">
import { HelperText, NumberInput, SegmentedControl } from "../../../components/ui";
import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupParamEditCard from "../shared/SetupParamEditCard.svelte";

type Props = {
  item: ParameterItemModel;
  value: number;
  suggestedSpeedMps: number | null;
  minimumAirspeedMps: number | null;
  airspeedSensorConfigured: boolean | null;
  disabled?: boolean;
  stagedName?: string;
  onUnstage?: (name: string) => void;
  onValueChange: (value: number) => void;
  modeTestId?: string;
  inputTestId?: string;
  stagedTestId?: string;
};

let {
  item,
  value,
  suggestedSpeedMps,
  minimumAirspeedMps,
  airspeedSensorConfigured,
  disabled = false,
  stagedName,
  onUnstage,
  onValueChange,
  modeTestId,
  inputTestId,
  stagedTestId,
}: Props = $props();

let mode = $derived(value > 0 ? "automatic" : value === -1 ? "disabled" : "unfinished");
let numericValue = $derived(value > 0 ? value : undefined);
let controlDisabled = $derived(disabled || item.readOnly);

function selectMode(nextMode: string) {
  if (controlDisabled) {
    return;
  }

  if (nextMode === "disabled") {
    onValueChange(-1);
    return;
  }

  if (nextMode === "automatic" && value <= 0 && suggestedSpeedMps !== null) {
    onValueChange(suggestedSpeedMps);
  }
}

function updateSpeed(event: Event) {
  const nextValue = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (Number.isFinite(nextValue) && nextValue > 0) {
    onValueChange(nextValue);
  }
}
</script>

{#snippet footer()}
  <div class="grid gap-2">
    {#if mode === "unfinished"}
      <SetupNotice tone="warning">
        Zero is an unfinished configuration and causes an ArduPilot pre-arm warning. Choose deliberate disable or enter a positive threshold.
      </SetupNotice>
    {/if}

    {#if mode === "automatic" && airspeedSensorConfigured === false}
      <SetupNotice tone="warning">
        No active airspeed sensor is configured. Synthetic airspeed can trigger assistance at the wrong time.
      </SetupNotice>
    {/if}

    {#if minimumAirspeedMps !== null}
      <HelperText size="xs">
        AIRSPEED_MIN is {minimumAirspeedMps} m/s.{suggestedSpeedMps !== null
          ? ` ArduPilot's parameter guidance suggests starting near ${suggestedSpeedMps} m/s and validating it in controlled flight.`
          : " Enter a threshold only after establishing the airframe's safe fixed-wing speed."}
      </HelperText>
    {:else}
      <HelperText size="xs">A positive threshold should be chosen from the aircraft's proven fixed-wing envelope.</HelperText>
    {/if}
  </div>
{/snippet}

<SetupParamEditCard
  {item}
  inputId="vtol-assist-speed"
  label="Fixed-wing assistance speed"
  description="Below this airspeed the VTOL motors can provide lift and stability assistance in fixed-wing modes."
  type="custom"
  {value}
  metadata="Q_ASSIST_SPEED · -1 off · positive automatic"
  {disabled}
  {stagedName}
  {stagedTestId}
  {onUnstage}
  {footer}
>
  <div class="grid gap-3">
    <SegmentedControl
      ariaLabel="Fixed-wing assistance mode"
      value={mode}
      options={[
        { value: "disabled", label: "Disabled deliberately" },
        {
          value: "automatic",
          label: "Automatic assistance",
          disabled: value <= 0 && suggestedSpeedMps === null,
        },
      ]}
      disabled={controlDisabled}
      testId={modeTestId}
      onValueChange={selectMode}
    />

    <div class="grid gap-1.5">
      <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="vtol-assist-speed">
        Automatic threshold
      </label>
      <NumberInput
        id="vtol-assist-speed"
        value={numericValue}
        min={0.1}
        max={item.range?.max ?? 100}
        step={item.increment ?? 0.1}
        unit="m/s"
        disabled={controlDisabled}
        testId={inputTestId}
        oninput={updateSpeed}
        onchange={updateSpeed}
      />
    </div>
  </div>
</SetupParamEditCard>
