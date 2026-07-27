<script lang="ts">
import { Radio } from "lucide-svelte";
import { onMount } from "svelte";
import { get } from "svelte/store";

import { getSerialPortInventoryContext, getSessionStoreContext, getSessionViewStoreContext } from "../../../app/shell/runtime-context";
import type { SessionConnectionFormState } from "../../../lib/platform/session";
import {
  firstConnectionFieldError,
  hasConnectionFieldErrors,
  validateConnectionForm,
  type ConnectionFieldErrors,
} from "../../../lib/connection/connection-form";
import { selectConnectionPanelPresentation } from "../../../lib/session-selectors";
import { notifyError } from "../../../lib/notifications";
import { Alert, Eyebrow, Panel } from "../../../components/ui";
import ConnectionDiagnostics from "./ConnectionDiagnostics.svelte";
import ConnectionTransportFields from "./ConnectionTransportFields.svelte";

const store = getSessionStoreContext();
const view = getSessionViewStoreContext();
const serialInventory = getSerialPortInventoryContext();

onMount(() => {
  if ($store.connectionForm.mode === "serial" || $store.connectionForm.mode === "web_serial") {
    void refreshSerialInventoryAndSelectDefault();
  }
});

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
let connectActionPending = $derived(!$view.connected && (($store.connectionRequestPhase ?? "idle") === "connecting" || $view.isConnecting));
let panelView = $derived(
  selectConnectionPanelPresentation({
    hydrated: $store.hydrated,
    isConnecting: connectActionPending,
    connected: $view.connected,
    selectedTransportAvailable: $view.selectedTransportDescriptor?.available ?? false,
    connectionMode: $store.connectionForm.mode,
    selectedBtDevice: $store.connectionForm.selectedBtDevice,
    visibleError,
  }),
);

function updateField<
  K extends keyof Pick<
    SessionConnectionFormState,
    | "mode"
    | "udpBind"
    | "tcpAddress"
    | "websocketUrl"
    | "serialPort"
    | "webSerialPortId"
    | "baud"
    | "selectedBtDevice"
    | "demoVehiclePreset"
  >,
>(field: K, value: SessionConnectionFormState[K]) {
  const patch = { [field]: value } as Partial<SessionConnectionFormState>;
  store.updateConnectionForm(patch);

  if (field === "mode") {
    showValidation = false;

    if (value === "serial" || value === "web_serial") {
      void refreshSerialInventoryAndSelectDefault();
    }
  }
}

async function refreshSerialInventoryAndSelectDefault() {
  await serialInventory.refresh();
  selectDefaultPortForCurrentMode();
}

async function runSessionAction(
  title: string,
  id: string,
  action: () => Promise<unknown>,
) {
  await action();
  const error = get(store).lastError;
  if (error) {
    notifyError(title, { description: error, id });
  }
}

async function grantWebSerialPortForConnect() {
  const port = await serialInventory.grantWebSerialPort();
  if (port) {
    store.updateConnectionForm({ mode: "web_serial", webSerialPortId: port.portName });
    return true;
  }

  return false;
}

function selectDefaultPortForCurrentMode() {
  const inventoryState = get(serialInventory);
  const form = get(store).connectionForm;
  if (form.mode === "serial" && form.serialPort.trim().length === 0) {
    const nativePort = inventoryState.ports.find((port) => port.source === "native");
    if (nativePort) {
      store.updateConnectionForm({ serialPort: nativePort.portName });
    }
  }
}

async function onSubmit(event: SubmitEvent) {
  event.preventDefault();

  const descriptor = $store.transportDescriptors.find((item) => item.kind === $store.connectionForm.mode);
  if (!descriptor) {
    return;
  }

  if ($store.connectionForm.mode === "web_serial") {
    showValidation = false;
    const granted = await grantWebSerialPortForConnect();
    if (!granted) {
      return;
    }

    const currentForm = get(store).connectionForm;
    showValidation = true;
    if (hasConnectionFieldErrors(validateConnectionForm(descriptor, currentForm))) {
      return;
    }

    await runSessionAction("Connection request failed", "connection-request", store.connect);
    return;
  }

  showValidation = true;
  if (hasConnectionFieldErrors(validateConnectionForm(descriptor, $store.connectionForm))) {
    return;
  }

  await runSessionAction("Connection request failed", "connection-request", store.connect);
}
</script>

<Panel padded>
  <div class="flex flex-wrap items-center gap-2">
    <Eyebrow as="div" class="flex min-w-0 items-center gap-1.5"><Radio aria-hidden="true" size={14} />Connection</Eyebrow>
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
      isConnecting={connectActionPending}
      onFieldChange={updateField}
      onCancelConnect={() => void runSessionAction("Unable to cancel connection", "connection-cancel", store.cancelConnect)}
      onDisconnect={() => void runSessionAction("Disconnect failed", "connection-disconnect", store.disconnect)}
      onRefreshBondedDevices={() => void runSessionAction("Unable to refresh bonded devices", "connection-bonded-refresh", store.refreshBondedDevices)}
      onRefreshSerialPorts={() => void refreshSerialInventoryAndSelectDefault()}
      onScanBleDevices={() => void runSessionAction("Bluetooth scan failed", "connection-bluetooth-scan", store.scanBleDevices)}
      serialInventory={$serialInventory}
      transportDescriptors={$store.transportDescriptors}
    />

    {#if localValidationError}
      <Alert
        density="compact"
        description={localValidationError}
        testId="connection-error-message"
        variant="danger"
      />
    {/if}

    <ConnectionDiagnostics state={$store} />
  </form>
</Panel>
