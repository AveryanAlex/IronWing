<script lang="ts">
import { KeyRound, ListChecks } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import { StagedBadge as SetupStagedBadge } from "../../../../components/ui";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { getVehicleSlug } from "../../../../lib/setup/vehicle-profile";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);
const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);
const armingRequireParams = [{ id: "ARMING_REQUIRE" }] as const;

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "arming"));
let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let vehicleSlug = $derived(getVehicleSlug(params.vehicleType));
let armingDocsUrl = $derived(resolveDocsUrl("arming", vehicleSlug));
let prearmDocsUrl = $derived(resolveDocsUrl("prearm_safety_checks", vehicleSlug ?? undefined));
let armingCheckItem = $derived(itemIndex.get("ARMING_CHECK") ?? null);
let armingRequireItem = $derived(itemIndex.get("ARMING_REQUIRE") ?? null);
let armingCheckEntries = $derived.by(() => {
  const bitmask = params.metadata?.get("ARMING_CHECK")?.bitmask;
  const currentMask = params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem?.value ?? null;
  if (!Array.isArray(bitmask) || !Number.isInteger(currentMask) || currentMask < 0) {
    return [];
  }

  return bitmask
    .filter(
      (entry) =>
        Number.isInteger(entry.bit) &&
        entry.bit >= 0 &&
        typeof entry.label === "string" &&
        entry.label.trim().length > 0,
    )
    .map((entry) => ({
      key: String(entry.bit),
      label: entry.label,
      checked: (currentMask & (1 << entry.bit)) !== 0,
    }));
});
let armingCheckValue = $derived(params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem?.value ?? null);
let armingRequireValue = $derived(params.stagedEdits.ARMING_REQUIRE?.nextValue ?? armingRequireItem?.value ?? null);
let checksDisabled = $derived(armingCheckValue === 0);
let checksPartial = $derived(armingCheckValue !== null && armingCheckValue !== 0 && armingCheckValue !== 1);
let armingMethodDisabled = $derived(armingRequireValue === 0);

function toggleArmingCheck(bit: number) {
  if (actionsBlocked || !armingCheckItem || armingCheckItem.readOnly === true) {
    return;
  }

  const currentMask = params.stagedEdits.ARMING_CHECK?.nextValue ?? armingCheckItem.value;
  if (!Number.isInteger(currentMask) || currentMask < 0) {
    return;
  }

  paramsStore.stageParameterEdit(armingCheckItem, currentMask ^ (1 << bit));
}

function setArmingChecks(checked: boolean) {
  if (actionsBlocked || !armingCheckItem || armingCheckItem.readOnly === true || armingCheckEntries.length === 0) {
    return;
  }

  const nextMask = checked ? armingCheckEntries.reduce((mask, entry) => mask | (1 << Number(entry.key)), 0) : 0;
  paramsStore.stageParameterEdit(armingCheckItem, nextMask);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Configure arming safeguards"
  description="Choose which pre-arm validations run and how the vehicle accepts an arm request. Changes remain staged until reviewed and applied."
  testId={setupWorkspaceTestIds.armingSection}
  docs={[
    { url: prearmDocsUrl, label: "Pre-arm docs", testId: setupWorkspaceTestIds.prearmDocsLink },
    { url: armingDocsUrl, label: "Arming docs", testId: setupWorkspaceTestIds.armingDocsLink },
  ]}
>
  {#snippet body()}
    {#if checksDisabled}
      <SetupNotice tone="danger" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-disabled`}>
        ARMING_CHECK is disabled, so the vehicle can arm without normal pre-flight safety validation.
      </SetupNotice>
    {:else if checksPartial}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-checks-partial`}>
        ARMING_CHECK is using a partial check set. Review the disabled checks before applying this configuration.
      </SetupNotice>
    {/if}

    {#if armingMethodDisabled}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.armingBannerPrefix}-method-disabled`}>
        ARMING_REQUIRE is disabled, so GCS arming can bypass the physical arming gesture safeguards.
      </SetupNotice>
    {/if}

    <div class="grid gap-3 xl:grid-cols-2">
      <SetupSectionCard
        icon={ListChecks}
        title={armingCheckItem?.label ?? "Arming checks"}
        description="Keep the default all-checks setting for routine operation. Toggling a check stages the updated ARMING_CHECK value."
        surface="elevated"
        testId={setupWorkspaceTestIds.armingCheckChecklist}
      >
        {#if params.stagedEdits.ARMING_CHECK}
          <p>
            <SetupStagedBadge
              name="ARMING_CHECK"
              onUnstage={paramsStore.discardStagedEdit}
              testId={`${setupWorkspaceTestIds.armingStagedPrefix}-ARMING_CHECK`}
            />
          </p>
        {/if}

        {#if armingCheckEntries.length > 0}
          <SetupBitmaskTable
            clearAllLabel="Disable all"
            description="Disable individual checks only for a documented bench procedure."
            disabled={actionsBlocked || armingCheckItem?.readOnly === true}
            embedded
            items={armingCheckEntries}
            onSetAll={setArmingChecks}
            onToggle={(entry) => toggleArmingCheck(Number(entry.key))}
            title="Configured pre-arm checks"
          />
        {:else}
          <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
        {/if}
      </SetupSectionCard>

      <SetupParamSection
        id="arming-require"
        icon={KeyRound}
        title={armingRequireItem?.label ?? "Arming method"}
        description="Choose how the vehicle can be armed. Keep physical arming safeguards enabled unless the operating procedure requires otherwise."
        params={armingRequireParams}
        disabled={actionsBlocked}
        surface="elevated"
        testIdPrefix="setup-workspace-arming"
      />
    </div>
  {/snippet}
</SetupSectionShell>
