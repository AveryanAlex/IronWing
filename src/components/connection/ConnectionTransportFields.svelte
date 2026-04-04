<script lang="ts">
import { describeTransportAvailability, type TransportDescriptor, type TransportType } from "../../transport";
import type { BluetoothDevice } from "../../telemetry";
import type { SessionConnectionFormState } from "../../lib/platform/session";
import type { ConnectionFieldErrors } from "../../lib/connection/connection-form";

type Field = keyof Pick<
  SessionConnectionFormState,
  "mode" | "udpBind" | "tcpAddress" | "serialPort" | "baud" | "selectedBtDevice"
>;

let {
  form,
  formLocked,
  errors,
  transportDescriptors,
  selectedTransportDescriptor,
  serialPorts,
  btDevices,
  btScanning,
  onFieldChange,
  onRefreshSerialPorts,
  onScanBleDevices,
  onRefreshBondedDevices,
}: {
  form: SessionConnectionFormState;
  formLocked: boolean;
  errors: ConnectionFieldErrors;
  transportDescriptors: TransportDescriptor[];
  selectedTransportDescriptor: TransportDescriptor | null;
  serialPorts: string[];
  btDevices: BluetoothDevice[];
  btScanning: boolean;
  onFieldChange: (field: Field, value: SessionConnectionFormState[Field]) => void;
  onRefreshSerialPorts: () => void;
  onScanBleDevices: () => void;
  onRefreshBondedDevices: () => void;
} = $props();

let bluetoothDevices = $derived(
  btDevices.filter((device) => (form.mode === "bluetooth_ble" ? device.device_type === "ble" : device.device_type === "classic")),
);

</script>

<label class="block space-y-1.5">
  <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Transport</span>
  <select
    class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
    data-testid="connection-transport-select"
    disabled={formLocked}
    name="mode"
    onchange={(event) => onFieldChange("mode", (event.currentTarget as HTMLSelectElement).value as TransportType)}
    value={form.mode}
  >
    {#if transportDescriptors.length === 0}
      <option value="udp">Loading transports…</option>
    {/if}
    {#each transportDescriptors as descriptor (descriptor.kind)}
      <option disabled={!descriptor.available} value={descriptor.kind}>
        {descriptor.label}{descriptor.available ? "" : " (unavailable)"}
      </option>
    {/each}
  </select>
</label>

{#if selectedTransportDescriptor}
  <p class={`text-xs ${selectedTransportDescriptor.available ? "text-text-muted" : "text-warning"}`}>
    {describeTransportAvailability(selectedTransportDescriptor)}
  </p>
{/if}

{#if form.mode === "udp"}
  <label class="block space-y-1.5">
    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">UDP bind</span>
    <input
      class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
      data-testid="connection-udp-bind"
      disabled={formLocked}
      name="udpBind"
      oninput={(event) => onFieldChange("udpBind", (event.currentTarget as HTMLInputElement).value)}
      placeholder="0.0.0.0:14550"
      value={form.udpBind}
    />
    {#if errors.udpBind}
      <p class="text-xs text-danger">{errors.udpBind}</p>
    {/if}
  </label>
{/if}

{#if form.mode === "tcp"}
  <label class="block space-y-1.5">
    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">TCP address</span>
    <input
      class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
      data-testid="connection-tcp-address"
      disabled={formLocked}
      name="tcpAddress"
      oninput={(event) => onFieldChange("tcpAddress", (event.currentTarget as HTMLInputElement).value)}
      placeholder="127.0.0.1:5760"
      value={form.tcpAddress}
    />
    {#if errors.tcpAddress}
      <p class="text-xs text-danger">{errors.tcpAddress}</p>
    {/if}
  </label>
{/if}

{#if form.mode === "serial"}
  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
    <label class="block space-y-1.5">
      <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Serial port</span>
      <select
        class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
        data-testid="connection-serial-port"
        disabled={formLocked}
        name="serialPort"
        onchange={(event) => onFieldChange("serialPort", (event.currentTarget as HTMLSelectElement).value)}
        value={form.serialPort}
      >
        <option value="">{serialPorts.length === 0 ? "No ports detected" : "Select a port"}</option>
        {#each serialPorts as port (port)}
          <option value={port}>{port}</option>
        {/each}
      </select>
      {#if errors.serialPort}
        <p class="text-xs text-danger">{errors.serialPort}</p>
      {/if}
    </label>

    <button
      aria-label="Refresh serial ports"
      class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-text-secondary transition hover:border-border-light hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      data-testid="connection-serial-refresh-btn"
      disabled={formLocked}
      onclick={onRefreshSerialPorts}
      title="Refresh serial ports"
      type="button"
    >
      <svg aria-hidden="true" class="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M20 12a8 8 0 1 1-2.34-5.66"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.8"
        ></path>
        <path d="M20 4v4h-4" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"></path>
      </svg>
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
      oninput={(event) => {
        const nextBaud = Number.parseInt((event.currentTarget as HTMLInputElement).value, 10);
        onFieldChange("baud", Number.isFinite(nextBaud) ? nextBaud : form.baud);
      }}
      type="number"
      value={form.baud}
    />
    {#if errors.baud}
      <p class="text-xs text-danger">{errors.baud}</p>
    {/if}
  </label>
{/if}

{#if form.mode === "bluetooth_ble" || form.mode === "bluetooth_spp"}
  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
    <label class="block space-y-1.5">
      <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
        {form.mode === "bluetooth_ble" ? "BLE device" : "Paired device"}
      </span>
      <select
        class="w-full rounded-xl border border-border bg-bg-input px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-accent"
        data-testid="connection-bluetooth-device"
        disabled={formLocked}
        name="selectedBtDevice"
        onchange={(event) => onFieldChange("selectedBtDevice", (event.currentTarget as HTMLSelectElement).value)}
        value={form.selectedBtDevice}
      >
        <option value="">{btDevices.length === 0 ? "No devices available" : "Select a device"}</option>
        {#each bluetoothDevices as device (device.address)}
          <option value={device.address}>{device.name || device.address}</option>
        {/each}
      </select>
      {#if errors.selectedBtDevice}
        <p class="text-xs text-danger">{errors.selectedBtDevice}</p>
      {/if}
    </label>

    <button
      class="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-text-secondary transition hover:border-border-light hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={form.mode === "bluetooth_ble" ? "connection-ble-scan-btn" : "connection-bt-refresh-btn"}
      disabled={formLocked || (form.mode === "bluetooth_ble" && btScanning)}
      onclick={form.mode === "bluetooth_ble" ? onScanBleDevices : onRefreshBondedDevices}
      type="button"
    >
      {form.mode === "bluetooth_ble" ? (btScanning ? "Scanning…" : "Scan") : "Refresh"}
    </button>
  </div>
{/if}
