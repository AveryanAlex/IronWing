<script lang="ts">
import { Radio } from "lucide-svelte";
import { onMount } from "svelte";
import { toast } from "svelte-sonner";

import { getSessionStoreContext, getSessionViewStoreContext } from "../../../app/shell/runtime-context";
import type { SessionConnectionFormState } from "../../../lib/platform/session";
import {
  firstConnectionFieldError,
  hasConnectionFieldErrors,
  validateConnectionForm,
  type ConnectionFieldErrors,
} from "../../../lib/connection/connection-form";
import { selectConnectionPanelPresentation } from "../../../lib/session-selectors";
import { Alert, Eyebrow, Panel } from "../../../components/ui";
import ConnectionDiagnostics from "./ConnectionDiagnostics.svelte";
import ConnectionTransportFields from "./ConnectionTransportFields.svelte";

const store = getSessionStoreContext();
const view = getSessionViewStoreContext();

onMount(() => {
  if ($store.connectionForm.mode === "serial") {
    void store.refreshSerialPorts();
  }
});

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
    | "mode"
    | "udpBind"
    | "tcpAddress"
    | "websocketUrl"
    | "serialPort"
    | "baud"
    | "selectedBtDevice"
    | "demoVehiclePreset"
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
      onCancelConnect={() => void store.cancelConnect()}
      onDisconnect={() => void store.disconnect()}
      onRefreshBondedDevices={() => void store.refreshBondedDevices()}
      onRefreshSerialPorts={() => void store.refreshSerialPorts()}
      onScanBleDevices={() => void store.scanBleDevices()}
      serialPorts={$store.serialPorts}
      transportDescriptors={$store.transportDescriptors}
    />

    {#if visibleError}
      <Alert
        density="compact"
        description={visibleError}
        testId="connection-error-message"
        variant="danger"
      />
    {/if}

    <ConnectionDiagnostics state={$store} />
  </form>
</Panel>
