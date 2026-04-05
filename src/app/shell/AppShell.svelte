<script lang="ts">
import { createLiveSettingsStore } from "../../lib/stores/live-settings";
import { createOperatorWorkspaceViewStore } from "../../lib/stores/operator-workspace-view";
import { createParameterWorkspaceViewStore, params } from "../../lib/stores/params";
import { runtime } from "../../lib/stores/runtime";
import { createSessionViewStore, session } from "../../lib/stores/session";
import AppShellContent from "./AppShellContent.svelte";
import { createShellChromeStore } from "./chrome-state";
import {
  setLiveSettingsStoreContext,
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
const sessionView = createSessionViewStore(session);
const operatorWorkspaceView = createOperatorWorkspaceViewStore(session);
const parameterWorkspaceView = createParameterWorkspaceViewStore(params);

setSessionStoreContext(session);
setSessionViewStoreContext(sessionView);
setOperatorWorkspaceViewStoreContext(operatorWorkspaceView);
setParamsStoreContext(params);
setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
setRuntimeStoreContext(runtime);
setShellChromeStoreContext(chrome);
setLiveSettingsStoreContext(liveSettings);
</script>

<AppShellContent />
