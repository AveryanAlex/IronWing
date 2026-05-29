<script lang="ts">
import type { HTMLInputAttributes } from "svelte/elements";

import { Input } from "../../../components/ui";
import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupParameterRow from "./SetupParameterRow.svelte";
import SetupParamEnumControl from "./SetupParamEnumControl.svelte";
import { resolveSetupDraftValue, type SetupEnumOption, type SetupStagedEdits } from "./parameter-editing";

type ControlWidth = "narrow" | "default" | "wide";
type Align = "center" | "start";
type EditorMode = "auto" | "enum" | "number";

type Props = {
  item: ParameterItemModel | null | undefined;
  id: string;
  label?: string;
  description?: string;
  options?: readonly SetupEnumOption[];
  mode?: EditorMode;
  value?: string;
  stagedEdits?: SetupStagedEdits;
  stagedTestId?: string;
  inputTestId?: string;
  labelTestId?: string;
  disabled?: boolean;
  controlWidth?: ControlWidth;
  align?: Align;
  inputMode?: HTMLInputAttributes["inputmode"];
  min?: HTMLInputAttributes["min"];
  max?: HTMLInputAttributes["max"];
  step?: HTMLInputAttributes["step"];
  unit?: string | null;
  onChange: (value: string) => void;
  onUnstage?: (name: string) => void;
};

let {
  item,
  id,
  label,
  description,
  options = [],
  mode = "auto",
  value,
  stagedEdits,
  stagedTestId,
  inputTestId,
  labelTestId,
  disabled = false,
  controlWidth = "default",
  align = "center",
  inputMode = "decimal",
  min,
  max,
  step,
  unit,
  onChange,
  onUnstage,
}: Props = $props();

let useEnumEditor = $derived(mode === "enum" || (mode === "auto" && options.length > 0));
let resolvedValue = $derived(value ?? resolveSetupDraftValue(item, stagedEdits));
let resolvedLabel = $derived(label ?? item?.label ?? "Setting");
let resolvedDescription = $derived(item?.description ?? description);
let resolvedMin = $derived(min ?? item?.range?.min);
let resolvedMax = $derived(max ?? item?.range?.max);
let resolvedStep = $derived(step ?? item?.increment ?? "any");
let controlDisabled = $derived(disabled || item?.readOnly === true || (mode === "enum" && options.length === 0));
let stagedName = $derived(item && stagedEdits?.[item.name] ? item.name : undefined);
</script>

{#if item}
  <SetupParameterRow
    {id}
    label={resolvedLabel}
    description={resolvedDescription}
    {labelTestId}
    {stagedName}
    {stagedTestId}
    {onUnstage}
    {controlWidth}
    {align}
  >
    {#if useEnumEditor}
      <SetupParamEnumControl
        disabled={controlDisabled}
        {id}
        onChange={onChange}
        options={[...options]}
        testId={inputTestId}
        value={resolvedValue}
      />
    {:else}
      <div class="flex items-center gap-2">
        <Input
          disabled={controlDisabled}
          {id}
          inputmode={inputMode}
          max={resolvedMax}
          min={resolvedMin}
          onchange={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => onChange((event.currentTarget as HTMLInputElement).value)}
          step={resolvedStep}
          testId={inputTestId}
          type="number"
          value={resolvedValue}
        />
        {#if unit}
          <span class="shrink-0 text-xs text-text-muted">{unit}</span>
        {/if}
      </div>
    {/if}
  </SetupParameterRow>
{/if}
