<script lang="ts">
import type { SvelteComponent } from "svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../app/shell/runtime-context";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import SetupParamEditCard from "./SetupParamEditCard.svelte";
import SetupParamEditGrid from "./SetupParamEditGrid.svelte";
import SetupSectionCard from "./SetupSectionCard.svelte";
import { resolveSetupEnumOptions, stageSetupParameterEdit } from "./parameter-editing";
import { resolveSetupParamRefs, type SetupParamRef } from "./setup-param-refs";

type IconComponent = new (...args: any[]) => SvelteComponent;

type Props = {
  id: string;
  title: string;
  icon?: IconComponent;
  description?: string;
  docsUrl?: string | null;
  params: readonly SetupParamRef[];
  disabled?: boolean;
  compact?: boolean;
  surface?: "default" | "elevated";
  testIdPrefix?: string;
};

let {
  id,
  title,
  icon,
  description,
  docsUrl,
  params,
  disabled = false,
  compact = false,
  surface = "default",
  testIdPrefix,
}: Props = $props();

const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let state = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(state.paramStore, state.metadata));
let items = $derived(resolveSetupParamRefs(params, itemIndex));

function enumOptions(item: ParameterItemModel) {
  return resolveSetupEnumOptions(state.metadata?.get(item.name)?.values);
}

function testId(kind: "card" | "input" | "staged", suffix: string): string | undefined {
  return testIdPrefix ? `${testIdPrefix}-${kind}-${suffix}` : undefined;
}
</script>

{#if items.length > 0}
  <SetupSectionCard
    {icon}
    {title}
    {description}
    {docsUrl}
    {compact}
    {surface}
    testId={testId("card", id)}
  >
    <SetupParamEditGrid>
      {#each items as item (item.name)}
        {@const options = enumOptions(item)}
        <SetupParamEditCard
          {item}
          inputId={`setup-${id}-${item.name}`}
          type={options.length > 0 ? "enum" : "number"}
          value={state.stagedEdits[item.name]?.nextValue ?? item.value}
          {options}
          stagedName={state.stagedEdits[item.name] ? item.name : undefined}
          stagedTestId={testId("staged", item.name)}
          onUnstage={paramsStore.discardStagedEdit}
          onValueChange={(value) => typeof value !== "boolean" && stageSetupParameterEdit(paramsStore, item, value, { actionsBlocked: disabled })}
          inputTestId={testId("input", item.name)}
          {disabled}
        />
      {/each}
    </SetupParamEditGrid>
  </SetupSectionCard>
{/if}
