<svelte:options runes={false} />

<script lang="ts">
import ConnectionPanel from "../../components/connection/ConnectionPanel.svelte";
import type { SessionStore } from "../../lib/stores/session";
import { appShellTestIds } from "./chrome-state";

export let store: SessionStore;
export let open = false;
export let onClose: () => void = () => {};
</script>

<div
  aria-hidden={!open}
  class="app-shell-drawer-backdrop"
  data-state={open ? "open" : "closed"}
  data-testid={appShellTestIds.vehiclePanelBackdrop}
  onclick={onClose}
></div>

<aside
  aria-hidden={!open}
  class="app-shell-drawer"
  data-state={open ? "open" : "closed"}
  data-testid={appShellTestIds.vehiclePanelDrawer}
  id="vehicle-panel-drawer"
>
  <div class="app-shell-drawer__sheet">
    <div class="app-shell-drawer__header">
      <div>
        <p class="runtime-eyebrow">Vehicle panel</p>
        <h2 class="text-2xl font-semibold tracking-[-0.03em] text-text-primary">Connection + session diagnostics</h2>
      </div>

      <button
        class="app-shell-drawer__close"
        data-testid={appShellTestIds.vehiclePanelClose}
        onclick={onClose}
        type="button"
      >
        Close
      </button>
    </div>

    {#if open}
      <ConnectionPanel {store} />
    {/if}
  </div>
</aside>
