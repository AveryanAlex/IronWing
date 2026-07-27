<script lang="ts">
import { Monitor } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionViewStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import OsdEditor from "../../../../features/setup/components/osd/OsdEditor.svelte";
import OsdSetupGuide from "../../../../features/setup/components/osd/OsdSetupGuide.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupHint from "../../../../features/setup/shared/SetupHint.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import { buildArduPilotOsdModel } from "../../../../lib/osd/ardupilot-osd-model";
import { buildEffectiveOsdParamValues, type OsdRenderSource } from "../../../../lib/osd/ardupilot-osd-renderer";
import { OSD_TYPE_DISPLAYPORT } from "../../../../lib/osd/ardupilot-osd-setup";
import {
  loadOsdDisplayTargetSelection,
  saveOsdDisplayTargetSelection,
  type OsdDisplayTargetSelection,
} from "../../../../lib/osd/osd-display-target";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { buildSerialPortModel } from "../../../../lib/setup/serial-port-model";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);
const paramsStore = getParamsStoreContext();
const sessionViewStore = getSessionViewStoreContext();
const paramsState = fromStore(paramsStore);
const sessionViewState = fromStore(sessionViewStore);

let selectedScreen = $state<number | null>(null);
let displayTarget = $state<OsdDisplayTargetSelection | null>(loadOsdDisplayTargetSelection());
let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "osd"));
let params = $derived(paramsState.current);
let sessionView = $derived(sessionViewState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let effectiveParamValues = $derived(buildEffectiveOsdParamValues(params.paramStore, params.stagedEdits));
let baseModel = $derived(
  buildArduPilotOsdModel({
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let activeScreenNumber = $derived(selectedScreen ?? baseModel.screens[0]?.screen ?? null);
let model = $derived(
  buildArduPilotOsdModel({
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
    displayTarget: effectiveParamValues.OSD_TYPE === OSD_TYPE_DISPLAYPORT ? displayTarget : null,
    displayTargetScreen: activeScreenNumber,
  }),
);
let serialModel = $derived(
  buildSerialPortModel({
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let docsUrl = $derived(resolveDocsUrl("osd"));
let previewSource = $derived.by<OsdRenderSource>(() => ({
  telemetry: sessionView.telemetry,
  vehicleState: sessionView.vehicleState,
  homePosition: sessionView.homePosition,
  statusMessage: view.statusNotices[view.statusNotices.length - 1]?.text ?? null,
  connected: sessionView.connected,
  paramValues: effectiveParamValues,
}));

function selectScreen(screen: number) {
  selectedScreen = screen;
}

function changeDisplayTarget(selection: OsdDisplayTargetSelection | null) {
  displayTarget = selection;
  saveOsdDisplayTargetSelection(selection);
}

function stageParam(name: string, value: number) {
  if (actionsBlocked) {
    return;
  }

  const item = itemIndex.get(name);
  if (!item || item.readOnly) {
    return;
  }

  paramsStore.stageParameterEdit(item, value);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="OSD"
  description="Configure ArduPilot on-screen display screens, item visibility, and character-grid positions from loaded OSD parameters."
  testId={setupWorkspaceTestIds.osdSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs" }]}
>
  {#snippet body()}
    <SetupNotice tone="info" icon={Monitor}>
      <p>
        OSD edits are staged as ArduPilot parameter changes. Use the global parameter review tray to inspect and apply them.
      </p>
    </SetupNotice>

    <OsdSetupGuide
      osdModel={model}
      {serialModel}
      selectedScreen={activeScreenNumber}
      paramStore={params.paramStore}
      stagedEdits={params.stagedEdits}
      {itemIndex}
      {displayTarget}
      disabled={actionsBlocked}
      onStageParam={stageParam}
      onDisplayTargetChange={changeDisplayTarget}
    />

    <OsdEditor
      {model}
      selectedScreen={activeScreenNumber}
      disabled={actionsBlocked}
      {itemIndex}
      {previewSource}
      {displayTarget}
      onSelectScreen={selectScreen}
      onStageParam={stageParam}
    />

    <SetupGuideCard title="OSD Parameter Model">
      <SetupHint>
        <p>
          IronWing discovers available items from triples like
          <span class="font-mono text-text-primary"> OSD1_ALTITUDE_EN</span>,
          <span class="font-mono text-text-primary"> OSD1_ALTITUDE_X</span>, and
          <span class="font-mono text-text-primary"> OSD1_ALTITUDE_Y</span>.
        </p>
      </SetupHint>

      <SetupHint>
        <p>
          DisplayPort grids are selected by connected-device target, not inferred from TXT_RES alone. The setup card stages only the active screen's OSDn_TXT_RES, and the preview follows staged values before apply.
        </p>
      </SetupHint>
    </SetupGuideCard>
  {/snippet}
</SetupSectionShell>
