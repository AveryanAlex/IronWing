<script lang="ts">
import { PlugZap, RefreshCw, Unplug } from "lucide-svelte";
import { type DemoVehiclePreset, type TransportDescriptor, type TransportType } from "../../transport";
import type { BluetoothDevice } from "../../telemetry";
import type { SessionConnectionFormState } from "../../lib/platform/session";
import type { ConnectionFieldErrors } from "../../lib/connection/connection-form";

type Field = keyof Pick<
  SessionConnectionFormState,
  "mode" | "udpBind" | "tcpAddress" | "serialPort" | "baud" | "selectedBtDevice" | "demoVehiclePreset"
>;

const demoVehiclePresetOptions: Array<{ value: DemoVehiclePreset; label: string }> = [
  { value: "quadcopter", label: "Quadcopter" },
  { value: "airplane", label: "Airplane" },
  { value: "quadplane", label: "QuadPlane" },
];

let {
  form,
  formLocked,
  errors,
  transportDescriptors,
  serialPorts,
  btDevices,
  btScanning,
  connectDisabled,
  connected,
  isConnecting,
  onFieldChange,
  onCancelConnect,
  onDisconnect,
  onRefreshSerialPorts,
  onScanBleDevices,
  onRefreshBondedDevices,
}: {
  form: SessionConnectionFormState;
  formLocked: boolean;
  errors: ConnectionFieldErrors;
  transportDescriptors: TransportDescriptor[];
  serialPorts: string[];
  btDevices: BluetoothDevice[];
  btScanning: boolean;
  connectDisabled: boolean;
  connected: boolean;
  isConnecting: boolean;
  onFieldChange: (field: Field, value: SessionConnectionFormState[Field]) => void;
  onCancelConnect: () => void;
  onDisconnect: () => void;
  onRefreshSerialPorts: () => void;
  onScanBleDevices: () => void;
  onRefreshBondedDevices: () => void;
} = $props();

let bluetoothDevices = $derived(
  btDevices.filter((device) => (form.mode === "bluetooth_ble" ? device.device_type === "ble" : device.device_type === "classic")),
);

let serialAdvancedOpen = $state(false);

$effect(() => {
  if (errors.baud) {
    serialAdvancedOpen = true;
  }
});

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-bg-input px-3 text-sm text-text-primary outline-none transition focus:border-accent disabled:cursor-not-allowed disabled:opacity-60";
const iconButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text-secondary transition hover:border-border-light hover:bg-bg-input hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50";
</script>

{#snippet primaryActionButton()}
  {#if isConnecting}
    <button
      aria-label="Cancel connection"
      class="connection-cancel-btn inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning text-bg-primary transition hover:brightness-105"
      data-testid="connection-cancel-btn"
      onclick={onCancelConnect}
      title="Cancel connection"
      type="button"
    >
      <span class="connection-cancel-btn__spinner" aria-hidden="true"></span>
      <span class="sr-only">Cancel</span>
    </button>
  {:else if connected}
    <button
      aria-label="Disconnect"
      class={iconButtonClass}
      data-testid="connection-disconnect-btn"
      onclick={onDisconnect}
      title="Disconnect"
      type="button"
    >
      <Unplug aria-hidden="true" size={16} />
    </button>
  {:else}
    <button
      aria-label="Connect"
      class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-bg-primary transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      data-testid="connection-connect-btn"
      disabled={connectDisabled}
      title="Connect"
      type="submit"
    >
      <PlugZap aria-hidden="true" size={16} />
    </button>
  {/if}
{/snippet}

<label class="block space-y-1.5">
  <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Transport</span>
  <select
    class={inputClass}
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

{#if form.mode === "udp"}
  <div class="space-y-1.5">
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label class="block min-w-0 space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">UDP bind</span>
        <input
          class={inputClass}
          data-testid="connection-udp-bind"
          disabled={formLocked}
          name="udpBind"
          oninput={(event) => onFieldChange("udpBind", (event.currentTarget as HTMLInputElement).value)}
          placeholder="0.0.0.0:14550"
          value={form.udpBind}
        />
      </label>
      {@render primaryActionButton()}
    </div>
    {#if errors.udpBind}
      <p class="text-xs text-danger">{errors.udpBind}</p>
    {/if}
  </div>
{/if}

{#if form.mode === "demo"}
  <div class="space-y-1.5">
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label class="block min-w-0 space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Demo vehicle</span>
        <select
          class={inputClass}
          data-testid="connection-demo-preset"
          disabled={formLocked}
          name="demoVehiclePreset"
          onchange={(event) =>
            onFieldChange("demoVehiclePreset", (event.currentTarget as HTMLSelectElement).value as DemoVehiclePreset)}
          value={form.demoVehiclePreset ?? "quadcopter"}
        >
          {#each demoVehiclePresetOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      {@render primaryActionButton()}
    </div>
    <p class="text-xs text-text-secondary">
      Connect to an in-browser demo vehicle that mirrors ArduPilot SITL defaults for quick telemetry and mission walkthroughs.
    </p>
  </div>
{/if}

{#if form.mode === "tcp"}
  <div class="space-y-1.5">
    <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <label class="block min-w-0 space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">TCP address</span>
        <input
          class={inputClass}
          data-testid="connection-tcp-address"
          disabled={formLocked}
          name="tcpAddress"
          oninput={(event) => onFieldChange("tcpAddress", (event.currentTarget as HTMLInputElement).value)}
          placeholder="127.0.0.1:5760"
          value={form.tcpAddress}
        />
      </label>
      {@render primaryActionButton()}
    </div>
    {#if errors.tcpAddress}
      <p class="text-xs text-danger">{errors.tcpAddress}</p>
    {/if}
  </div>
{/if}

{#if form.mode === "serial"}
  <div class="space-y-1.5">
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2">
      <label class="block min-w-0 space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Serial port</span>
        <select
          class={inputClass}
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
      </label>

      {@render primaryActionButton()}

      <button
        aria-label="Refresh serial ports"
        class={iconButtonClass}
        data-testid="connection-serial-refresh-btn"
        disabled={formLocked}
        onclick={onRefreshSerialPorts}
        title="Refresh serial ports"
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} />
      </button>
    </div>
    {#if errors.serialPort}
      <p class="text-xs text-danger">{errors.serialPort}</p>
    {/if}
  </div>

  <details class="rounded-lg border border-border/80 bg-bg-input/30 px-3 py-2" bind:open={serialAdvancedOpen}>
    <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-text-muted">Advanced</summary>
    <label class="mt-2 block space-y-1.5">
      <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">Baud</span>
      <input
        class={inputClass}
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
    </label>
    {#if errors.baud}
      <p class="mt-1.5 text-xs text-danger">{errors.baud}</p>
    {/if}
  </details>
{/if}

{#if form.mode === "bluetooth_ble" || form.mode === "bluetooth_spp"}
  <div class="space-y-1.5">
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2">
      <label class="block min-w-0 space-y-1.5">
        <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
          {form.mode === "bluetooth_ble" ? "BLE device" : "Paired device"}
        </span>
        <select
          class={inputClass}
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
      </label>

      {@render primaryActionButton()}

      <button
        aria-label={form.mode === "bluetooth_ble" ? (btScanning ? "Scanning BLE devices" : "Scan BLE devices") : "Refresh paired devices"}
        class={iconButtonClass}
        data-testid={form.mode === "bluetooth_ble" ? "connection-ble-scan-btn" : "connection-bt-refresh-btn"}
        disabled={formLocked || (form.mode === "bluetooth_ble" && btScanning)}
        onclick={form.mode === "bluetooth_ble" ? onScanBleDevices : onRefreshBondedDevices}
        title={form.mode === "bluetooth_ble" ? (btScanning ? "Scanning BLE devices" : "Scan BLE devices") : "Refresh paired devices"}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={16} />
      </button>
    </div>
    {#if errors.selectedBtDevice}
      <p class="text-xs text-danger">{errors.selectedBtDevice}</p>
    {/if}
  </div>
{/if}

<style>
  .connection-cancel-btn__spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
    border-top-color: currentColor;
    animation: connection-cancel-btn-rotate 0.8s linear infinite;
  }

  @keyframes connection-cancel-btn-rotate {
    from {
      transform: rotate(0);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .connection-cancel-btn__spinner {
      animation-duration: 4s;
    }
  }
</style>
