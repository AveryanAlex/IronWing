<script lang="ts">
import { Eyebrow, Sheet } from "../../components/ui";
import { appShellTestIds } from "./chrome-state";
import VehiclePanelContent from "./VehiclePanelContent.svelte";

type Props = {
  open?: boolean;
  onClose?: () => void;
};

let { open = false, onClose = () => {} }: Props = $props();
</script>

{#if !open}
  <aside
    aria-hidden="true"
    class="hidden"
    data-state="closed"
    data-testid={appShellTestIds.vehiclePanelDrawer}
    id="vehicle-panel-drawer"
  ></aside>
{/if}

<Sheet.Root {open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
  {#if open}
    <Sheet.Content
      aria-label="Vehicle panel"
      class="w-[min(100vw,26rem)] gap-4 p-4"
      data-state="open"
      data-testid={appShellTestIds.vehiclePanelDrawer}
      id="vehicle-panel-drawer"
      showClose={false}
      side="right"
    >
      <Sheet.Header class="flex-row items-start justify-between gap-3 pr-0">
        <div>
          <Eyebrow>Vehicle panel</Eyebrow>
          <Sheet.Title class="mt-1">Connection & telemetry</Sheet.Title>
        </div>

        <Sheet.Close
          ariaLabel="Close"
          class="shrink-0"
          data-testid={appShellTestIds.vehiclePanelClose}
        >
          Close
        </Sheet.Close>
      </Sheet.Header>

      <VehiclePanelContent />
    </Sheet.Content>
  {/if}
</Sheet.Root>
