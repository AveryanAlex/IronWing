<script lang="ts">
import { appShellTestIds } from "./chrome-state";
import VehiclePanelContent from "./VehiclePanelContent.svelte";

type Props = {
  open?: boolean;
  onClose?: () => void;
};

let { open = false, onClose = () => {} }: Props = $props();
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
        <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Vehicle panel</p>
        <h2 class="mt-1 text-base font-semibold text-text-primary">Connection & telemetry</h2>
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
      <VehiclePanelContent />
    {/if}
  </div>
</aside>
