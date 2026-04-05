<script lang="ts">
import { createLiveSettingsStore } from "../../lib/stores/live-settings";
import { createMissionPlannerStore, createMissionPlannerViewStore } from "../../lib/stores/mission-planner";
import { createOperatorWorkspaceViewStore } from "../../lib/stores/operator-workspace-view";
import { createParameterWorkspaceViewStore, params } from "../../lib/stores/params";
import { runtime } from "../../lib/stores/runtime";
import { createSessionViewStore, session } from "../../lib/stores/session";
import AppShellContent from "./AppShellContent.svelte";
import { createShellChromeStore } from "./chrome-state";
import {
  setLiveSettingsStoreContext,
  setMissionPlannerStoreContext,
  setMissionPlannerViewStoreContext,
  setOperatorWorkspaceViewStoreContext,
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
  setShellChromeStoreContext,
} from "./runtime-context";

const chrome = createShellChromeStore();
const liveSettings = createLiveSettingsStore(session);
const missionPlanner = createMissionPlannerStore(session);
const missionPlannerView = createMissionPlannerViewStore(missionPlanner);
const sessionView = createSessionViewStore(session);
const operatorWorkspaceView = createOperatorWorkspaceViewStore(session);
const parameterWorkspaceView = createParameterWorkspaceViewStore(params);

setSessionStoreContext(session);
setSessionViewStoreContext(sessionView);
setOperatorWorkspaceViewStoreContext(operatorWorkspaceView);
setParamsStoreContext(params);
setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
setMissionPlannerStoreContext(missionPlanner);
setMissionPlannerViewStoreContext(missionPlannerView);
setRuntimeStoreContext(runtime);
setShellChromeStoreContext(chrome);
setLiveSettingsStoreContext(liveSettings);
</script>

<AppShellContent />
