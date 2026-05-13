<script lang="ts">
import { Radio } from "lucide-svelte";
import { onMount } from "svelte";
import { toast } from "svelte-sonner";

import { getSessionStoreContext, getSessionViewStoreContext } from "../../app/shell/runtime-context";
import type { SessionConnectionFormState } from "../../lib/platform/session";
import {
  firstConnectionFieldError,
  hasConnectionFieldErrors,
  validateConnectionForm,
  type ConnectionFieldErrors,
} from "../../lib/connection/connection-form";
import { selectConnectionPanelPresentation, type ViewTone } from "../../lib/session-selectors";
import { Panel, StatusPill } from "../ui";
import ConnectionDiagnostics from "./ConnectionDiagnostics.svelte";
import ConnectionTransportFields from "./ConnectionTransportFields.svelte";

const store = getSessionStoreContext();
const view = getSessionViewStoreContext();

onMount(() => {
  if ($store.connectionForm.mode === "serial") {
    void store.refreshSerialPorts();
  }
});

function pillTone(tone: ViewTone): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

let lastToastedError: string | null = null;
let showValidation = $state(false);

let fieldErrors = $derived.by<ConnectionFieldErrors>(() => {
  if (!showValidation) {
    return {};
  }

  const descriptor = $store.transportDescriptors.find((item) => item.kind === $store.connectionForm.mode);
  return descriptor ? validateConnectionForm(descriptor, $store.connectionForm) : {};
});

let localValidationError = $derived(firstConnectionFieldError(fieldErrors));
let visibleError = $derived($store.lastError ?? localValidationError);
let panelView = $derived(
  selectConnectionPanelPresentation({
    hydrated: $store.hydrated,
    isConnecting: $view.isConnecting,
    connected: $view.connected,
    selectedTransportAvailable: $view.selectedTransportDescriptor?.available ?? false,
    connectionMode: $store.connectionForm.mode,
    selectedBtDevice: $store.connectionForm.selectedBtDevice,
    visibleError,
  }),
);

$effect(() => {
  const currentError = $store.lastError;
  if (!currentError) {
    lastToastedError = null;
  } else if (currentError !== lastToastedError) {
    lastToastedError = currentError;
    toast.error("Connection request failed", { description: currentError });
  }
});

function updateField<
  K extends keyof Pick<
    SessionConnectionFormState,
    "mode" | "udpBind" | "tcpAddress" | "serialPort" | "baud" | "selectedBtDevice" | "demoVehiclePreset"
  >,
>(field: K, value: SessionConnectionFormState[K]) {
  const patch = { [field]: value } as Partial<SessionConnectionFormState>;
  store.updateConnectionForm(patch);

  if (field === "mode" && value === "serial") {
    void store.refreshSerialPorts();
  }
}

async function onSubmit(event: SubmitEvent) {
  event.preventDefault();

  const descriptor = $store.transportDescriptors.find((item) => item.kind === $store.connectionForm.mode);
  if (!descriptor) {
    return;
  }

  showValidation = true;
  if (hasConnectionFieldErrors(validateConnectionForm(descriptor, $store.connectionForm))) {
    return;
  }

  await store.connect();
}
</script>

<Panel padded>
  <div class="flex items-center justify-between gap-2">
    <p class="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-muted"><Radio aria-hidden="true" size={14} />Connection</p>
    <span data-testid="connection-status-text">
      <StatusPill tone={pillTone(panelView.statusTone)}>{panelView.statusLabel}</StatusPill>
    </span>
  </div>

  <form class="mt-3 flex flex-col gap-3" onsubmit={onSubmit}>
    <ConnectionTransportFields
      btDevices={$store.btDevices}
      btScanning={$store.btScanning}
      errors={fieldErrors}
      form={$store.connectionForm}
      formLocked={panelView.formLocked}
      connectDisabled={panelView.connectDisabled}
      connected={$view.connected}
      isConnecting={$view.isConnecting}
      onFieldChange={updateField}
      onCancelConnect={() => void store.cancelConnect()}
      onDisconnect={() => void store.disconnect()}
      onRefreshBondedDevices={() => void store.refreshBondedDevices()}
      onRefreshSerialPorts={() => void store.refreshSerialPorts()}
      onScanBleDevices={() => void store.scanBleDevices()}
      serialPorts={$store.serialPorts}
      transportDescriptors={$store.transportDescriptors}
    />

    {#if visibleError}
      <p
        class="m-0 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        data-testid="connection-error-message"
      >
        {visibleError}
      </p>
    {/if}

    <ConnectionDiagnostics state={$store} />
  </form>
</Panel>
