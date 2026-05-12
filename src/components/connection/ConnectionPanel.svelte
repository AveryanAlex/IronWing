<script lang="ts">
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
  <div class="connection-panel__header">
    <p class="connection-panel__eyebrow">Connection</p>
    <span data-testid="connection-status-text">
      <StatusPill tone={pillTone(panelView.statusTone)}>{panelView.statusLabel}</StatusPill>
    </span>
  </div>

  <form class="connection-panel__form" onsubmit={onSubmit}>
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
      <p class="connection-panel__error" data-testid="connection-error-message">
        {visibleError}
      </p>
    {/if}

    <ConnectionDiagnostics state={$store} />
  </form>
</Panel>

<style>
.connection-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.connection-panel__eyebrow {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.connection-panel__form {
  margin-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.connection-panel__error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  color: var(--color-danger);
  font-size: 0.86rem;
}
</style>
