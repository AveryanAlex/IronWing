<script lang="ts">
import type { SvelteComponent } from "svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { buildParameterItemIndex } from "../../../lib/params/parameter-item-model";
import {
  resolveSetupControlAvailability,
  type SetupControlAvailability,
} from "../../../lib/setup/control-availability";
import { stageSetupParameterEdit } from "./parameter-editing";
import { resolveSetupParamRef, type SetupParamRef } from "./setup-param-refs";
import SetupParamEditCard from "./SetupParamEditCard.svelte";
import SetupSectionCard from "./SetupSectionCard.svelte";

type IconComponent = new (...args: any[]) => SvelteComponent;

type BitmaskOption = {
  bit: number;
  label: string;
};

type Props = {
  id: string;
  title: string;
  param: SetupParamRef;
  bitmaskOptions: readonly BitmaskOption[];
  icon?: IconComponent;
  description?: string;
  docsUrl?: string | null;
  disabled?: boolean;
  availability?: SetupControlAvailability;
  disabledDescription?: string;
  compact?: boolean;
  surface?: "default" | "elevated";
  testIdPrefix?: string;
};

let {
  id,
  title,
  param,
  bitmaskOptions,
  icon,
  description,
  docsUrl,
  disabled = false,
  availability,
  disabledDescription,
  compact = false,
  surface = "default",
  testIdPrefix,
}: Props = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let state = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(state.paramStore, state.metadata));
let item = $derived(resolveSetupParamRef(param, itemIndex));
let value = $derived(item ? (state.stagedEdits[item.name]?.nextValue ?? item.value) : 0);
let resolvedAvailability = $derived(resolveSetupControlAvailability({ availability, disabled, disabledDescription }));

function testId(kind: "card" | "input" | "staged", suffix: string): string | undefined {
  return testIdPrefix ? `${testIdPrefix}-${kind}-${suffix}` : undefined;
}
</script>

{#if item}
  <SetupSectionCard
    {icon}
    {title}
    {description}
    {docsUrl}
    {compact}
    {surface}
    testId={testId("card", id)}
  >
    <SetupParamEditCard
      {item}
      inputId={`setup-${id}-${item.name}`}
      type="bitmask"
      {value}
      {bitmaskOptions}
      stagedName={state.stagedEdits[item.name] ? item.name : undefined}
      stagedTestId={testId("staged", item.name)}
      onUnstage={paramsStore.discardStagedEdit}
      inputTestId={testId("input", item.name)}
      availability={resolvedAvailability}
      onValueChange={(nextValue) => typeof nextValue === "number" && stageSetupParameterEdit(paramsStore, item, nextValue, { actionsBlocked: disabled })}
    />
  </SetupSectionCard>
{/if}
