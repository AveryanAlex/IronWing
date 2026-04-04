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

function toneBadgeClass(tone: ViewTone): string {
  switch (tone) {
    case "positive":
      return "border-success/30 bg-success/10 text-success";
    case "caution":
      return "border-warning/30 bg-warning/10 text-warning";
    case "critical":
      return "border-danger/30 bg-danger/10 text-danger";
    default:
      return "border-border-light bg-bg-primary/70 text-text-secondary";
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
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">Session link</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Connection</h2>
      <p class="mt-1 text-sm text-text-secondary">
        Choose a transport and connect to your vehicle.
      </p>
    </div>

    <div
      class={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-semibold ${toneBadgeClass(panelView.statusTone)}`}
      data-testid="connection-status-text"
    >
      <span class={`h-2 w-2 rounded-full ${toneDotClass(panelView.statusTone)}`}></span>
      {panelView.statusLabel}
    </div>
  </div>

  <form class="mt-4 space-y-4" onsubmit={onSubmit}>
    <ConnectionTransportFields
      btDevices={$store.btDevices}
      btScanning={$store.btScanning}
      errors={fieldErrors}
      form={$store.connectionForm}
      formLocked={panelView.formLocked}
      onFieldChange={updateField}
      onRefreshBondedDevices={() => void store.refreshBondedDevices()}
      onRefreshSerialPorts={() => void store.refreshSerialPorts()}
      onScanBleDevices={() => void store.scanBleDevices()}
      selectedTransportDescriptor={$view.selectedTransportDescriptor}
      serialPorts={$store.serialPorts}
      transportDescriptors={$store.transportDescriptors}
    />

    <div class="flex flex-wrap gap-3">
      {#if $view.isConnecting}
        <button
          class="rounded-md bg-warning px-3 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105"
          data-testid="connection-cancel-btn"
          onclick={() => void store.cancelConnect()}
          type="button"
        >
          Cancel
        </button>
      {:else if $view.connected}
        <button
          class="rounded-md border border-border bg-bg-primary px-3 py-2 text-sm font-semibold text-text-primary transition hover:border-border-light hover:bg-bg-input"
          data-testid="connection-disconnect-btn"
          onclick={() => void store.disconnect()}
          type="button"
        >
          Disconnect
        </button>
      {:else}
        <button
          class="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-bg-primary transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="connection-connect-btn"
          disabled={panelView.connectDisabled}
          type="submit"
        >
          Connect
        </button>
      {/if}
    </div>

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
