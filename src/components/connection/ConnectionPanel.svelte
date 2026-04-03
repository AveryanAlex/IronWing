<svelte:options runes={false} />

<script lang="ts">
import { createForm } from "felte";
import { get } from "svelte/store";
import { toast } from "svelte-sonner";

import {
  createSessionViewStore,
  session,
  type SessionStore,
  type SessionStoreState,
} from "../../lib/stores/session";
import { describeTransportAvailability, validateTransportDescriptor, type TransportType } from "../../transport";

export let store: SessionStore = session;

let view = createSessionViewStore(store);
let lastToastedError: string | null = null;
let externalSyncSignature = JSON.stringify(toFormValues(get(store).connectionForm));
let formLocked = false;
let connectDisabled = true;
let statusLabel = "Idle";
let statusTone: "green" | "amber" | "red" | "slate" = "slate";
let visibleError: string | null = null;

type ConnectionValues = {
  mode: TransportType;
  udpBind: string;
  tcpAddress: string;
  serialPort: string;
  baud: string;
  selectedBtDevice: string;
};

function toFormValues(connectionForm: SessionStoreState["connectionForm"]): ConnectionValues {
  return {
    mode: connectionForm.mode,
    udpBind: connectionForm.udpBind,
    tcpAddress: connectionForm.tcpAddress,
    serialPort: connectionForm.serialPort,
    baud: String(connectionForm.baud),
    selectedBtDevice: connectionForm.selectedBtDevice,
  };
}

function toConnectValue(values: ConnectionValues) {
  return {
    bind_addr: (values.udpBind ?? "").trim(),
    address:
      values.mode === "tcp"
        ? (values.tcpAddress ?? "").trim()
        : (values.selectedBtDevice ?? "").trim(),
    port: (values.serialPort ?? "").trim(),
    baud: (values.baud ?? "").trim().length > 0 ? Number(values.baud) : null,
  };
}

function toConnectionPatch(values: ConnectionValues): Partial<SessionStoreState["connectionForm"]> {
  const fallbackBaud = Number.parseInt(values.baud ?? "", 10);

  return {
    mode: values.mode,
    udpBind: values.udpBind ?? "",
    tcpAddress: values.tcpAddress ?? "",
    serialPort: values.serialPort ?? "",
    baud: Number.isFinite(fallbackBaud) ? fallbackBaud : get(store).connectionForm.baud,
    selectedBtDevice: values.selectedBtDevice ?? "",
  };
}

function firstError(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (Array.isArray(value)) {
    return firstError(value[0]);
  }

  return null;
}

function validate(values: ConnectionValues) {
  const descriptor = get(store).transportDescriptors.find((item) => item.kind === values.mode);
  if (!descriptor) {
    return {};
  }

  const fieldErrors: Partial<Record<keyof ConnectionValues, string>> = {};
  const validationErrors = validateTransportDescriptor(descriptor, toConnectValue(values));

  for (const error of validationErrors) {
    if (error.includes("bind_addr")) {
      fieldErrors.udpBind = error;
      continue;
    }

    if (error.includes("address")) {
      if (values.mode === "tcp") {
        fieldErrors.tcpAddress = error;
      } else {
        fieldErrors.selectedBtDevice = error;
      }
      continue;
    }

    if (error.includes("port")) {
      fieldErrors.serialPort = error;
      continue;
    }

    if (error.includes("baud")) {
      fieldErrors.baud = error;
    }
  }

  return fieldErrors;
}

const { form, data, errors, setFields } = createForm<ConnectionValues>({
  initialValues: toFormValues(get(store).connectionForm),
  onSubmit: async () => {
    await store.connect();
  },
  validate,
});

$: view = createSessionViewStore(store);

$: {
  const next = toFormValues($store.connectionForm);
  const nextSignature = JSON.stringify(next);
  if (nextSignature !== externalSyncSignature) {
    externalSyncSignature = nextSignature;

    for (const [field, value] of Object.entries(next)) {
      setFields(field as keyof ConnectionValues, value as never, false);
    }
  }
}

$: {
  const currentError = visibleError;
  if (!currentError) {
    lastToastedError = null;
  } else if (currentError !== lastToastedError) {
    lastToastedError = currentError;
    toast.error("Connection request failed", { description: currentError });
  }
}

$: formLocked = $view.isConnecting || $view.connected;
$: connectDisabled =
  !$store.hydrated
  || formLocked
  || !$view.selectedTransportDescriptor?.available
  || (($data.mode === "bluetooth_ble" || $data.mode === "bluetooth_spp") && !($data.selectedBtDevice ?? "").trim());
$: visibleError =
  $store.lastError
  ?? firstError($errors.udpBind)
  ?? firstError($errors.tcpAddress)
  ?? firstError($errors.serialPort)
  ?? firstError($errors.baud)
  ?? firstError($errors.selectedBtDevice);
$: statusLabel = $view.isConnecting ? "Connecting" : $view.connected ? "Connected" : visibleError ? "Error" : "Idle";
$: statusTone = $view.isConnecting ? "amber" : $view.connected ? "green" : visibleError ? "red" : "slate";

function updateField<K extends keyof ConnectionValues>(field: K, value: ConnectionValues[K]) {
  setFields(field, value, true);
  const next = { ...$data, [field]: value };
  externalSyncSignature = JSON.stringify(next);
  store.updateConnectionForm(toConnectionPatch(next));
}
</script>

<section class="rounded-[24px] border border-border bg-bg-secondary/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="runtime-eyebrow mb-2">Session Link</p>
      <h2 class="text-2xl font-semibold tracking-[-0.03em] text-text-primary">Connect to a live vehicle</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
        This seed surface proves the Svelte singleton session store, typed transport boundary, and live telemetry
        readback without reusing the legacy React sidebar shell.
      </p>
    </div>

    <div
      class={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusTone === "green" ? "border-success/30 bg-success/10 text-success" : statusTone === "amber" ? "border-warning/30 bg-warning/10 text-warning" : statusTone === "red" ? "border-danger/30 bg-danger/10 text-danger" : "border-border-light bg-bg-primary/70 text-text-secondary"}`}
      data-testid="connection-status-text"
    >
      <span
        class={`h-2 w-2 rounded-full ${statusTone === "green" ? "bg-success" : statusTone === "amber" ? "bg-warning" : statusTone === "red" ? "bg-danger" : "bg-text-muted"}`}
      ></span>
      {statusLabel}
    </div>
  </div>

  <form use:form class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
    <div class="space-y-4">
      <label class="block space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Transport</span>
        <select
          class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
          data-testid="connection-transport-select"
          disabled={formLocked}
          name="mode"
          onchange={(event) => updateField("mode", (event.currentTarget as HTMLSelectElement).value as TransportType)}
          value={$data.mode}
        >
          {#if $store.transportDescriptors.length === 0}
            <option value="udp">Loading transports…</option>
          {/if}
          {#each $store.transportDescriptors as descriptor (descriptor.kind)}
            <option disabled={!descriptor.available} value={descriptor.kind}>
              {descriptor.label}{descriptor.available ? "" : " (unavailable)"}
            </option>
          {/each}
        </select>
      </label>

      {#if $view.selectedTransportDescriptor}
        <p class={`text-xs ${$view.selectedTransportDescriptor.available ? "text-text-muted" : "text-warning"}`}>
          {describeTransportAvailability($view.selectedTransportDescriptor)}
        </p>
      {/if}

      {#if $data.mode === "udp"}
        <label class="block space-y-1.5">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">UDP bind</span>
          <input
            class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
            data-testid="connection-udp-bind"
            disabled={formLocked}
            name="udpBind"
            oninput={(event) => updateField("udpBind", (event.currentTarget as HTMLInputElement).value)}
            placeholder="0.0.0.0:14550"
            value={$data.udpBind}
          />
          {#if firstError($errors.udpBind)}
            <p class="text-xs text-danger">{firstError($errors.udpBind)}</p>
          {/if}
        </label>
      {/if}

      {#if $data.mode === "tcp"}
        <label class="block space-y-1.5">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">TCP address</span>
          <input
            class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
            data-testid="connection-tcp-address"
            disabled={formLocked}
            name="tcpAddress"
            oninput={(event) => updateField("tcpAddress", (event.currentTarget as HTMLInputElement).value)}
            placeholder="127.0.0.1:5760"
            value={$data.tcpAddress}
          />
          {#if firstError($errors.tcpAddress)}
            <p class="text-xs text-danger">{firstError($errors.tcpAddress)}</p>
          {/if}
        </label>
      {/if}

      {#if $data.mode === "serial"}
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label class="block space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Serial port</span>
            <select
              class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
              data-testid="connection-serial-port"
              disabled={formLocked}
              name="serialPort"
              onchange={(event) => updateField("serialPort", (event.currentTarget as HTMLSelectElement).value)}
              value={$data.serialPort}
            >
              <option value="">{$store.serialPorts.length === 0 ? "No ports detected" : "Select a port"}</option>
              {#each $store.serialPorts as port (port)}
                <option value={port}>{port}</option>
              {/each}
            </select>
            {#if firstError($errors.serialPort)}
              <p class="text-xs text-danger">{firstError($errors.serialPort)}</p>
            {/if}
          </label>

          <button
            class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition hover:border-border-light hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="connection-serial-refresh-btn"
            disabled={formLocked}
            onclick={() => void store.refreshSerialPorts()}
            type="button"
          >
            Refresh ports
          </button>
        </div>

        <label class="block space-y-1.5">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Baud</span>
          <input
            class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
            data-testid="connection-serial-baud"
            disabled={formLocked}
            inputmode="numeric"
            name="baud"
            oninput={(event) => updateField("baud", (event.currentTarget as HTMLInputElement).value)}
            type="number"
            value={$data.baud}
          />
          {#if firstError($errors.baud)}
            <p class="text-xs text-danger">{firstError($errors.baud)}</p>
          {/if}
        </label>
      {/if}

      {#if $data.mode === "bluetooth_ble" || $data.mode === "bluetooth_spp"}
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label class="block space-y-1.5">
            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
              {$data.mode === "bluetooth_ble" ? "BLE device" : "Paired device"}
            </span>
            <select
              class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
              data-testid="connection-bluetooth-device"
              disabled={formLocked}
              name="selectedBtDevice"
              onchange={(event) => updateField("selectedBtDevice", (event.currentTarget as HTMLSelectElement).value)}
              value={$data.selectedBtDevice}
            >
              <option value="">{$store.btDevices.length === 0 ? "No devices available" : "Select a device"}</option>
              {#each $store.btDevices.filter((device) => $data.mode === "bluetooth_ble" ? device.device_type === "ble" : device.device_type === "classic") as device (device.address)}
                <option value={device.address}>{device.name || device.address}</option>
              {/each}
            </select>
            {#if firstError($errors.selectedBtDevice)}
              <p class="text-xs text-danger">{firstError($errors.selectedBtDevice)}</p>
            {/if}
          </label>

          <button
            class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition hover:border-border-light hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={$data.mode === "bluetooth_ble" ? "connection-ble-scan-btn" : "connection-bt-refresh-btn"}
            disabled={formLocked || ($data.mode === "bluetooth_ble" && $store.btScanning)}
            onclick={() => {
              if ($data.mode === "bluetooth_ble") {
                void store.scanBleDevices();
                return;
              }

              void store.refreshBondedDevices();
            }}
            type="button"
          >
            {$data.mode === "bluetooth_ble" ? ($store.btScanning ? "Scanning…" : "Scan") : "Refresh"}
          </button>
        </div>
      {/if}

      <div class="flex flex-wrap gap-3">
        {#if $view.isConnecting}
          <button
            class="rounded-xl bg-warning px-4 py-2.5 text-sm font-semibold text-bg-primary transition hover:brightness-105"
            data-testid="connection-cancel-btn"
            onclick={() => void store.cancelConnect()}
            type="button"
          >
            Cancel
          </button>
        {:else if $view.connected}
          <button
            class="rounded-xl bg-bg-primary px-4 py-2.5 text-sm font-semibold text-text-primary transition hover:border-border-light hover:bg-bg-input"
            data-testid="connection-disconnect-btn"
            onclick={() => void store.disconnect()}
            type="button"
          >
            Disconnect
          </button>
        {:else}
          <button
            class="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg-primary transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="connection-connect-btn"
            disabled={connectDisabled}
            type="submit"
          >
            Connect
          </button>
        {/if}
      </div>

      {#if visibleError}
        <p
          class="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          data-testid="connection-error-message"
        >
          {visibleError}
        </p>
      {/if}
    </div>

    <div class="rounded-[20px] border border-border bg-bg-primary/60 p-4">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Link diagnostics</p>
      <dl class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="rounded-2xl border border-border bg-bg-secondary/70 p-3">
          <dt class="text-xs uppercase tracking-[0.16em] text-text-muted">Last phase</dt>
          <dd class="mt-2 text-sm font-semibold text-text-primary" data-testid="connection-diagnostics-last-phase">
            {$store.lastPhase}
          </dd>
        </div>
        <div class="rounded-2xl border border-border bg-bg-secondary/70 p-3">
          <dt class="text-xs uppercase tracking-[0.16em] text-text-muted">Active source</dt>
          <dd class="mt-2 text-sm font-semibold text-text-primary" data-testid="connection-diagnostics-active-source">
            {$store.activeSource ?? "none"}
          </dd>
        </div>
        <div class="rounded-2xl border border-border bg-bg-secondary/70 p-3">
          <dt class="text-xs uppercase tracking-[0.16em] text-text-muted">Envelope</dt>
          <dd class="mt-2 break-all font-mono text-xs text-text-secondary" data-testid="connection-diagnostics-envelope">
            {$store.activeEnvelope ? `${$store.activeEnvelope.session_id} · rev ${$store.activeEnvelope.reset_revision}` : "no active session"}
          </dd>
        </div>
        <div class="rounded-2xl border border-border bg-bg-secondary/70 p-3">
          <dt class="text-xs uppercase tracking-[0.16em] text-text-muted">Bootstrap</dt>
          <dd class="mt-2 text-sm font-semibold text-text-primary" data-testid="connection-diagnostics-bootstrap">
            {$store.hydrated ? "ready" : "initializing"}
          </dd>
        </div>
      </dl>
    </div>
  </form>
</section>
