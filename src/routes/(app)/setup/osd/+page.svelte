<script lang="ts">
import { Monitor } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import OsdEditor from "../../../../features/setup/components/osd/OsdEditor.svelte";
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
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);
const paramsStore = getParamsStoreContext();
const paramsState = fromStore(paramsStore);

let selectedScreen = $state<number | null>(null);
let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "osd"));
let params = $derived(paramsState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let model = $derived(
  buildArduPilotOsdModel({
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let activeScreenNumber = $derived(selectedScreen ?? model.screens[0]?.screen ?? null);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let docsUrl = $derived(resolveDocsUrl("osd"));

function selectScreen(screen: number) {
  selectedScreen = screen;
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

    <OsdEditor
      {model}
      selectedScreen={activeScreenNumber}
      disabled={actionsBlocked}
      {itemIndex}
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
          The preview uses a conservative 30 x 16 character grid. Exact font and video-mode parity can be refined once more layout parameters are exposed.
        </p>
      </SetupHint>
    </SetupGuideCard>
  {/snippet}
</SetupSectionShell>
