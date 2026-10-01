<script lang="ts">
import { HelperText, NumberInput, Slider } from "../../../../components/ui";
import { SetupParamEditCard } from "../../../../features/setup/shared";
import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  buildServoOutputSettings,
  servoPwmValidationError,
  type ServoPwmSetting,
} from "../../../../lib/setup/servo-output-settings";
import type { StagedParameterEdit } from "../../../../lib/stores/params";

type Props = {
  outputIndex: number;
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  stagedEdits: Record<string, StagedParameterEdit | undefined>;
  actionsBlocked: boolean;
  onStage: (item: ParameterItemModel, value: number) => void;
  onUnstage: (name: string) => void;
};

let { outputIndex, itemIndex, stagedEdits, actionsBlocked, onStage, onUnstage }: Props = $props();
let errors = $state<Record<string, string | undefined>>({});
let points = $derived(buildServoOutputSettings(outputIndex, itemIndex, stagedEdits));
let reverseName = $derived(`SERVO${outputIndex}_REVERSED`);
let reverseItem = $derived(itemIndex.get(reverseName));
let reverseValue = $derived(reverseItem ? (stagedEdits[reverseName]?.nextValue ?? reverseItem.value) : 0);

function stagePoint(setting: ServoPwmSetting, value: string | number | boolean) {
  if (!setting.item || setting.item.readOnly || actionsBlocked) return;
  const nextValue = Number(value);
  const error = servoPwmValidationError(setting, nextValue);
  errors = { ...errors, [setting.paramName]: error ?? undefined };
  if (!error && nextValue !== setting.value) onStage(setting.item, nextValue);
}

function unstage(name: string) {
  if (actionsBlocked) return;
  errors = { ...errors, [name]: undefined };
  onUnstage(name);
}

function stageReverse(value: string | number | boolean) {
  if (!reverseItem || reverseItem.readOnly || actionsBlocked) return;
  onStage(reverseItem, value ? 1 : 0);
}

function stageNumber(setting: ServoPwmSetting, event: Event) {
  stagePoint(setting, (event.currentTarget as HTMLInputElement).valueAsNumber);
}
</script>

<div class="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {#if reverseItem}
    <SetupParamEditCard
      item={reverseItem}
      label="Reversed"
      description="Reverse the direction of this physical servo output."
      type="boolean"
      value={reverseValue === 1}
      disabled={actionsBlocked}
      offLabel="Normal"
      onLabel="Reversed"
      stagedName={stagedEdits[reverseName] ? reverseName : undefined}
      onUnstage={unstage}
      inputTestId={`setup-workspace-output-reversed-${outputIndex}`}
      onValueChange={stageReverse}
    />
  {:else}
    <HelperText>Reversed · parameter unavailable</HelperText>
  {/if}

  {#each points as setting (setting.paramName)}
    {#if setting.item}
      <SetupParamEditCard
        item={setting.item}
        label={setting.label}
        type="custom"
        description={setting.point === "mid" ? "Servo center / trim PWM point." : setting.item.description}
        value={setting.value ?? setting.item.value}
        disabled={actionsBlocked}
        invalid={Boolean(errors[setting.paramName])}
        stagedName={stagedEdits[setting.paramName] ? setting.paramName : undefined}
        onUnstage={unstage}
      >
        <div class="grid min-w-0 gap-2">
          <Slider
            value={setting.value ?? setting.item?.value ?? setting.sliderMin}
            min={setting.sliderMin}
            max={setting.sliderMax}
            step={1}
            ariaLabel={setting.label}
            unit=" µs"
            disabled={actionsBlocked || setting.item?.readOnly || setting.sliderMin >= setting.sliderMax}
            testId={`setup-workspace-output-${setting.point}-${outputIndex}-slider`}
            onValueCommit={(value) => stagePoint(setting, value)}
          />
          <NumberInput
            id={`setup-param-edit-${setting.paramName}`}
            value={setting.value ?? undefined}
            min={setting.min}
            max={setting.max ?? undefined}
            step={1}
            unit="µs"
            invalid={Boolean(errors[setting.paramName])}
            disabled={actionsBlocked || setting.item?.readOnly}
            testId={`setup-workspace-output-${setting.point}-${outputIndex}`}
            oninput={(event) => stageNumber(setting, event)}
            onchange={(event) => stageNumber(setting, event)}
          />
        </div>
        {#snippet footer()}
          {#if errors[setting.paramName]}
            <p class="text-xs text-danger" role="alert">{errors[setting.paramName]}</p>
          {/if}
        {/snippet}
      </SetupParamEditCard>
    {:else}
      <HelperText>{setting.label} · parameter unavailable</HelperText>
    {/if}
  {/each}
</div>
