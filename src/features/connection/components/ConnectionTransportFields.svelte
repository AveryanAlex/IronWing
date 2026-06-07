<script lang="ts">
import { Info, PlugZap, RefreshCw, Unplug } from "lucide-svelte";
import type { ConnectionFieldErrors } from "../../../lib/connection/connection-form";
import type { SessionConnectionFormState } from "../../../lib/platform/session";
import type { SerialPortInventoryState } from "../../../lib/stores/serial-port-inventory";
import { Button, Eyebrow, Field, IconButton, Input, NativeSelect, Tooltip } from "../../../components/ui";

import type { BluetoothDevice } from "../../../telemetry";
import { type DemoVehiclePreset, type TransportDescriptor, type TransportType } from "../../../transport";

type ConnectionField = keyof Pick<
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
>;

const demoVehiclePresetOptions: Array<{ value: DemoVehiclePreset; label: string }> = [
  { value: "quadcopter", label: "Quadcopter" },
  { value: "airplane", label: "Airplane" },
  { value: "quadplane", label: "QuadPlane" },
];

const connectionActionRowClass = "grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-2";
const connectionActionRowWithExtraClass = "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2";

const transportHelpCopy: Record<TransportType, { title: string; description: string }> = {
  udp: {
    title: "UDP connection",
    description: "Bind a local UDP endpoint that listens for MAVLink packets, such as 0.0.0.0:14550 for local SITL or telemetry radios.",
  },
  tcp: {
    title: "TCP connection",
    description: "Connect to a MAVLink TCP endpoint, such as SITL on 127.0.0.1:5760.",
  },
  serial: {
    title: "Serial connection",
    description: "Pick the detected autopilot serial port. Refresh after plugging in hardware. Baud defaults to 57600; change it under Advanced only if your adapter or vehicle uses another rate.",
  },
  bluetooth_ble: {
    title: "BLE connection",
    description: "Scan for nearby BLE devices and choose the MAVLink-capable peripheral before connecting.",
  },
  bluetooth_spp: {
    title: "Classic Bluetooth connection",
    description: "Choose an already paired Classic Bluetooth SPP device. Refresh if the OS pairing changed.",
  },
  websocket: {
    title: "WebSocket connection",
    description: "Connect through a raw MAVLink WebSocket bridge. For local SITL, run pnpm run sitl:ws and use the shown ws:// URL.",
  },
  web_serial: {
    title: "Web Serial connection",
    description: "Grant a browser serial port first, then choose it from the granted-port list. Set baud first if the default does not match your device.",
  },
  web_bluetooth: {
    title: "Web Bluetooth connection",
    description: "The browser asks you to choose a Nordic UART BLE device when you connect.",
  },
  demo: {
    title: "Demo vehicle",
    description: "Connect to the built-in MAVKit demo vehicle for quick telemetry and mission walkthroughs.",
  },
};

let {
  form,
  formLocked,
  errors,
  transportDescriptors,
  serialInventory,
  btDevices,
  btScanning,
  connectDisabled,
  connected,
  isConnecting,
  onFieldChange,
  onCancelConnect,
  onDisconnect,
  onRefreshSerialPorts,
  onGrantWebSerialPort,
  onScanBleDevices,
  onRefreshBondedDevices,
}: {
  form: SessionConnectionFormState;
  formLocked: boolean;
  errors: ConnectionFieldErrors;
  transportDescriptors: TransportDescriptor[];
  serialInventory: SerialPortInventoryState;
  btDevices: BluetoothDevice[];
  btScanning: boolean;
  connectDisabled: boolean;
  connected: boolean;
  isConnecting: boolean;
  onFieldChange: (field: ConnectionField, value: SessionConnectionFormState[ConnectionField]) => void;
  onCancelConnect: () => void;
  onDisconnect: () => void;
  onRefreshSerialPorts: () => void;
  onGrantWebSerialPort: () => void;
  onScanBleDevices: () => void;
  onRefreshBondedDevices: () => void;
} = $props();

let bluetoothDevices = $derived(
  btDevices.filter((device) => (form.mode === "bluetooth_ble" ? device.device_type === "ble" : device.device_type === "classic")),
);
let activeTransportHelp = $derived(transportHelpCopy[form.mode]);
let nativeSerialPorts = $derived(serialInventory.ports.filter((port) => port.source === "native"));
let webSerialPorts = $derived(serialInventory.ports.filter((port) => port.source === "web_serial"));
let serialInventoryRefreshing = $derived(serialInventory.phase === "refreshing");
let webSerialGranting = $derived(serialInventory.phase === "granting");
let transportOptions = $derived(
  transportDescriptors.length === 0
    ? [{ value: "udp", label: "Loading transports…" }]
    : transportDescriptors.map((descriptor) => ({
        value: descriptor.kind,
        label: `${descriptor.label}${descriptor.available ? "" : " (unavailable)"}`,
        disabled: !descriptor.available,
      })),
);
let serialPortOptions = $derived([
  { value: "", label: nativeSerialPorts.length === 0 ? "No ports detected" : "Select a port" },
  ...nativeSerialPorts.map((port) => ({ value: port.portName, label: port.label })),
]);
let webSerialPortOptions = $derived([
  { value: "", label: webSerialPorts.length === 0 ? "No granted WebSerial ports" : "Select a granted port" },
  ...webSerialPorts.map((port) => ({ value: port.portName, label: port.label })),
]);
let bluetoothDeviceOptions = $derived([
  { value: "", label: btDevices.length === 0 ? "No devices available" : "Select a device" },
  ...bluetoothDevices.map((device) => ({ value: device.address, label: device.name || device.address })),
]);

let serialAdvancedOpen = $state(false);

$effect(() => {
  if (errors.baud) {
    serialAdvancedOpen = true;
  }
});

function parseBaud(value: string) {
  const nextBaud = Number.parseInt(value, 10);
  return Number.isFinite(nextBaud) ? nextBaud : form.baud;
}
</script>

{#snippet primaryActionButton()}
  {#if isConnecting}
    <Tooltip label="Cancel connection">
      <Button
        ariaLabel="Cancel connection"
        class="connection-cancel-btn"
        testId="connection-cancel-btn"
        onclick={onCancelConnect}
        size="icon"
        type="button"
        variant="warning"
      >
        <span class="connection-cancel-btn__spinner" aria-hidden="true"></span>
        <span class="sr-only">Cancel</span>
      </Button>
    </Tooltip>
  {:else if connected}
    <Tooltip label="Disconnect">
      <IconButton
        ariaLabel="Disconnect"
        testId="connection-disconnect-btn"
        onclick={onDisconnect}
        title=""
        type="button"
      >
        <Unplug aria-hidden="true" size={16} />
      </IconButton>
    </Tooltip>
  {:else}
    <Tooltip label="Connect">
      <Button
        ariaLabel="Connect"
        testId="connection-connect-btn"
        disabled={connectDisabled}
        size="icon"
        type="submit"
      >
        <PlugZap aria-hidden="true" size={16} />
      </Button>
    </Tooltip>
  {/if}
{/snippet}

{#snippet activeTransportTooltip()}
  <p class="font-semibold text-text-primary">{activeTransportHelp.title}</p>
  <p class="mt-1" data-testid="connection-transport-help-content">{activeTransportHelp.description}</p>
{/snippet}

<Field.Root>
  <div class="flex items-center justify-between gap-2">
    <Field.Label variant="eyebrow" for="connection-transport-select">
      Transport
    </Field.Label>
    <Tooltip
      align="end"
      clickToToggle
      content={activeTransportTooltip}
      contentTestId="connection-transport-help-popover"
      label="Show transport help"
      side="bottom"
    >
      <IconButton
        ariaLabel="Show transport help"
        class="rounded-full p-0.5"
        size="auto"
        testId="connection-transport-help-btn"
        title=""
        tone="accent"
        type="button"
        variant="ghost"
      >
        <Info aria-hidden="true" size={12} />
      </IconButton>
    </Tooltip>
  </div>
  <NativeSelect
    aria-label="Transport"
    disabled={formLocked}
    id="connection-transport-select"
    name="mode"
    onchange={(event) => onFieldChange("mode", (event.currentTarget as HTMLSelectElement).value as TransportType)}
    options={transportOptions}
    testId="connection-transport-select"
    value={form.mode}
  />
</Field.Root>

{#if form.mode === "udp"}
  <Field.Root invalid={Boolean(errors.udpBind)}>
    <div class={connectionActionRowClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.udpBind)}>
        <Field.Label variant="eyebrow" for="connection-udp-bind">UDP bind</Field.Label>
        <Input
          data-testid="connection-udp-bind"
          disabled={formLocked}
          id="connection-udp-bind"
          invalid={Boolean(errors.udpBind)}
          name="udpBind"
          oninput={(event) => onFieldChange("udpBind", (event.currentTarget as HTMLInputElement).value)}
          placeholder="0.0.0.0:14550"
          value={form.udpBind}
        />
      </Field.Root>
      {@render primaryActionButton()}
    </div>
    <Field.Error message={errors.udpBind} />
  </Field.Root>
{/if}

{#if form.mode === "demo"}
  <Field.Root>
    <div class={connectionActionRowClass} data-connection-action-row>
      <Field.Root class="min-w-0">
        <Field.Label variant="eyebrow" for="connection-demo-preset">Demo vehicle</Field.Label>
        <NativeSelect
          disabled={formLocked}
          id="connection-demo-preset"
          name="demoVehiclePreset"
          onchange={(event) =>
            onFieldChange("demoVehiclePreset", (event.currentTarget as HTMLSelectElement).value as DemoVehiclePreset)}
          options={demoVehiclePresetOptions}
          testId="connection-demo-preset"
          value={form.demoVehiclePreset ?? "quadcopter"}
        />
      </Field.Root>
      {@render primaryActionButton()}
    </div>
  </Field.Root>
{/if}

{#if form.mode === "tcp"}
  <Field.Root invalid={Boolean(errors.tcpAddress)}>
    <div class={connectionActionRowClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.tcpAddress)}>
        <Field.Label variant="eyebrow" for="connection-tcp-address">TCP address</Field.Label>
        <Input
          data-testid="connection-tcp-address"
          disabled={formLocked}
          id="connection-tcp-address"
          invalid={Boolean(errors.tcpAddress)}
          name="tcpAddress"
          oninput={(event) => onFieldChange("tcpAddress", (event.currentTarget as HTMLInputElement).value)}
          placeholder="127.0.0.1:5760"
          value={form.tcpAddress}
        />
      </Field.Root>
      {@render primaryActionButton()}
    </div>
    <Field.Error message={errors.tcpAddress} />
  </Field.Root>
{/if}

{#if form.mode === "websocket"}
  <Field.Root invalid={Boolean(errors.websocketUrl)}>
    <div class={connectionActionRowClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.websocketUrl)}>
        <Field.Label variant="eyebrow" for="connection-websocket-url">WebSocket URL</Field.Label>
        <Input
          data-testid="connection-websocket-url"
          disabled={formLocked}
          id="connection-websocket-url"
          invalid={Boolean(errors.websocketUrl)}
          name="websocketUrl"
          oninput={(event) => onFieldChange("websocketUrl", (event.currentTarget as HTMLInputElement).value)}
          placeholder="ws://127.0.0.1:14560"
          value={form.websocketUrl}
        />
      </Field.Root>
      {@render primaryActionButton()}
    </div>
    <Field.Error message={errors.websocketUrl} />
  </Field.Root>
{/if}

{#if form.mode === "serial"}
  <Field.Root invalid={Boolean(errors.serialPort)}>
    <div class={connectionActionRowWithExtraClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.serialPort)}>
        <Field.Label variant="eyebrow" for="connection-serial-port">Serial port</Field.Label>
        <NativeSelect
          disabled={formLocked}
          id="connection-serial-port"
          invalid={Boolean(errors.serialPort)}
          name="serialPort"
          onchange={(event) => onFieldChange("serialPort", (event.currentTarget as HTMLSelectElement).value)}
          options={serialPortOptions}
          testId="connection-serial-port"
          value={form.serialPort}
        />
      </Field.Root>

      {@render primaryActionButton()}

      <Tooltip label="Refresh serial ports">
        <IconButton
          ariaLabel="Refresh serial ports"
          testId="connection-serial-refresh-btn"
          disabled={formLocked || serialInventoryRefreshing}
          onclick={onRefreshSerialPorts}
          title=""
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </IconButton>
      </Tooltip>
    </div>
    <Field.Error message={errors.serialPort} />
  </Field.Root>

  <details class="rounded-lg border border-border/80 bg-bg-input/30 px-3 py-2" bind:open={serialAdvancedOpen}>
    <summary class="cursor-pointer">
      <Eyebrow as="span">Advanced · Baud {form.baud}</Eyebrow>
    </summary>
    <Field.Root class="mt-2" invalid={Boolean(errors.baud)}>
      <Field.Label variant="eyebrow" for="connection-serial-baud">Baud</Field.Label>
      <Input
        data-testid="connection-serial-baud"
        disabled={formLocked}
        id="connection-serial-baud"
        inputmode="numeric"
        invalid={Boolean(errors.baud)}
        name="baud"
        oninput={(event) => onFieldChange("baud", parseBaud((event.currentTarget as HTMLInputElement).value))}
        type="number"
        value={form.baud}
      />
      <Field.Error message={errors.baud} />
    </Field.Root>
  </details>
{/if}

{#if form.mode === "web_serial"}
  <Field.Root invalid={Boolean(errors.webSerialPortId)}>
    <div class={connectionActionRowWithExtraClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.webSerialPortId)}>
        <Field.Label variant="eyebrow" for="connection-web-serial-port">Web Serial port</Field.Label>
        <NativeSelect
          disabled={formLocked}
          id="connection-web-serial-port"
          invalid={Boolean(errors.webSerialPortId)}
          name="webSerialPortId"
          onchange={(event) => onFieldChange("webSerialPortId", (event.currentTarget as HTMLSelectElement).value)}
          options={webSerialPortOptions}
          testId="connection-web-serial-port"
          value={form.webSerialPortId}
        />
      </Field.Root>
      {@render primaryActionButton()}

      <Tooltip label={webSerialGranting ? "Granting WebSerial port" : "Grant WebSerial port"}>
        <IconButton
          ariaLabel={webSerialGranting ? "Granting WebSerial port" : "Grant WebSerial port"}
          testId="connection-web-serial-grant-btn"
          disabled={formLocked || webSerialGranting || !serialInventory.canGrantWebSerial}
          onclick={onGrantWebSerialPort}
          title=""
          type="button"
        >
          <PlugZap aria-hidden="true" size={16} />
        </IconButton>
      </Tooltip>
    </div>
    <Field.Error message={errors.webSerialPortId} />
    {#if serialInventory.error}
      <p class="mt-1 text-xs text-status-danger">{serialInventory.error}</p>
    {/if}
    <Field.Root invalid={Boolean(errors.baud)}>
      <Field.Label variant="eyebrow" for="connection-web-serial-baud">Baud</Field.Label>
      <Input
        data-testid="connection-web-serial-baud"
        disabled={formLocked}
        id="connection-web-serial-baud"
        inputmode="numeric"
        invalid={Boolean(errors.baud)}
        name="baud"
        oninput={(event) => onFieldChange("baud", parseBaud((event.currentTarget as HTMLInputElement).value))}
        type="number"
        value={form.baud}
      />
      <Field.Error message={errors.baud} />
    </Field.Root>
  </Field.Root>
{/if}

{#if form.mode === "bluetooth_ble" || form.mode === "bluetooth_spp"}
  <Field.Root invalid={Boolean(errors.selectedBtDevice)}>
    <div class={connectionActionRowWithExtraClass} data-connection-action-row>
      <Field.Root class="min-w-0" invalid={Boolean(errors.selectedBtDevice)}>
        <Field.Label variant="eyebrow" for="connection-bluetooth-device">
          {form.mode === "bluetooth_ble" ? "BLE device" : "Paired device"}
        </Field.Label>
        <NativeSelect
          disabled={formLocked}
          id="connection-bluetooth-device"
          invalid={Boolean(errors.selectedBtDevice)}
          name="selectedBtDevice"
          onchange={(event) => onFieldChange("selectedBtDevice", (event.currentTarget as HTMLSelectElement).value)}
          options={bluetoothDeviceOptions}
          testId="connection-bluetooth-device"
          value={form.selectedBtDevice}
        />
      </Field.Root>

      {@render primaryActionButton()}

      <Tooltip label={form.mode === "bluetooth_ble" ? (btScanning ? "Scanning BLE devices" : "Scan BLE devices") : "Refresh paired devices"}>
        <IconButton
          ariaLabel={form.mode === "bluetooth_ble" ? (btScanning ? "Scanning BLE devices" : "Scan BLE devices") : "Refresh paired devices"}
          testId={form.mode === "bluetooth_ble" ? "connection-ble-scan-btn" : "connection-bt-refresh-btn"}
          disabled={formLocked || (form.mode === "bluetooth_ble" && btScanning)}
          onclick={form.mode === "bluetooth_ble" ? onScanBleDevices : onRefreshBondedDevices}
          title=""
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </IconButton>
      </Tooltip>
    </div>
    <Field.Error message={errors.selectedBtDevice} />
  </Field.Root>
{/if}

{#if form.mode === "web_bluetooth"}
  <Field.Root>
    <div class={connectionActionRowClass} data-connection-action-row>
      <div class="min-w-0 space-y-1.5">
        <Eyebrow as="span">Web Bluetooth</Eyebrow>
      </div>
      {@render primaryActionButton()}
    </div>
  </Field.Root>
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
