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
import ConnectionDiagnostics from "./ConnectionDiagnostics.svelte";
import ConnectionTransportFields from "./ConnectionTransportFields.svelte";

const store = getSessionStoreContext();
const view = getSessionViewStoreContext();

onMount(() => {
  if ($store.connectionForm.mode === "serial") {
    void store.refreshSerialPorts();
  }
});

function toneTextClass(tone: ViewTone): string {
  switch (tone) {
    case "positive":
      return "text-success";
    case "caution":
      return "text-warning";
    case "critical":
      return "text-danger";
    default:
      return "text-text-secondary";
  }
}

function toneDotClass(tone: ViewTone): string {
  switch (tone) {
    case "positive":
      return "bg-success";
    case "caution":
      return "bg-warning";
    case "critical":
      return "bg-danger";
    default:
      return "bg-text-muted";
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
    "mode" | "udpBind" | "tcpAddress" | "serialPort" | "baud" | "selectedBtDevice"
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

<section class="rounded-lg border border-border bg-bg-primary p-3">
  <div class="flex items-center justify-between gap-2">
    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Connection</p>
    <div
      class={`inline-flex items-center gap-1.5 text-xs font-semibold ${toneTextClass(panelView.statusTone)}`}
      data-testid="connection-status-text"
    >
      <span class={`h-2 w-2 rounded-full ${toneDotClass(panelView.statusTone)}`}></span>
      {panelView.statusLabel}
    </div>
  </div>

  <form class="mt-3 space-y-3" onsubmit={onSubmit}>
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
        class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        data-testid="connection-error-message"
      >
        {visibleError}
      </p>
    {/if}

    <ConnectionDiagnostics state={$store} />
  </form>
</section>
