<script lang="ts">
import { createParameterWorkspaceViewStore, params } from "../../lib/stores/params";
import { runtime } from "../../lib/stores/runtime";
import { createSessionViewStore, session } from "../../lib/stores/session";
import AppShellContent from "./AppShellContent.svelte";
import { createShellChromeStore } from "./chrome-state";
import {
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
  setShellChromeStoreContext,
} from "./runtime-context";

const chrome = createShellChromeStore();
const sessionView = createSessionViewStore(session);
const parameterWorkspaceView = createParameterWorkspaceViewStore(params);

setSessionStoreContext(session);
setSessionViewStoreContext(sessionView);
setParamsStoreContext(params);
setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
setRuntimeStoreContext(runtime);
setShellChromeStoreContext(chrome);
</script>

<AppShellContent />
