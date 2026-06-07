import { describe, expect, it } from "vitest";

import {
  buildConnectRequest,
  type BluetoothBleTransportDescriptor,
  type DemoTransportDescriptor,
  type WebSerialTransportDescriptor,
  type WebSocketTransportDescriptor,
  validateTransportDescriptor,
} from "./transport";

const demoDescriptor: DemoTransportDescriptor = {
  kind: "demo",
  label: "Demo",
  available: true,
  validation: {},
};

const websocketDescriptor: WebSocketTransportDescriptor = {
  kind: "websocket",
  label: "WebSocket",
  available: true,
  validation: { url_required: true },
};

const webSerialDescriptor: WebSerialTransportDescriptor = {
  kind: "web_serial",
  label: "Web Serial",
  available: true,
  validation: { chooser_required: true, baud_required: true },
  default_baud: 57600,
};

const bluetoothBleDescriptor: BluetoothBleTransportDescriptor = {
  kind: "bluetooth_ble",
  label: "BLE (Nordic UART)",
  available: true,
  validation: { address_required: true },
  profile: "nordic_uart",
};

describe("validateTransportDescriptor", () => {
  it("accepts demo transport without address-like fields", () => {
    expect(
      validateTransportDescriptor(demoDescriptor, {
        demo_vehicle_preset: "quadcopter",
      }),
    ).toEqual([]);
  });

  it("requires a websocket url for the browser websocket transport", () => {
    expect(validateTransportDescriptor(websocketDescriptor, {})).toEqual(["websocket_url is required"]);
  });

  it("requires a granted WebSerial port id before connecting", () => {
    expect(validateTransportDescriptor(webSerialDescriptor, { baud: 115200 })).toEqual(["port_id is required"]);
  });

  it("requires a selected Nordic UART BLE device before connecting", () => {
    expect(validateTransportDescriptor(bluetoothBleDescriptor, {})).toEqual(["address is required"]);
  });
});

describe("buildConnectRequest", () => {
  it("builds the demo connect request with the selected preset", () => {
    expect(
      buildConnectRequest(demoDescriptor, {
        demo_vehicle_preset: "airplane",
      }),
    ).toEqual({
      transport: {
        kind: "demo",
        vehicle_preset: "airplane",
      },
    });
  });

  it("builds the websocket connect request", () => {
    expect(
      buildConnectRequest(websocketDescriptor, {
        websocket_url: "ws://127.0.0.1:14560",
      }),
    ).toEqual({
      transport: {
        kind: "websocket",
        url: "ws://127.0.0.1:14560",
      },
    });
  });

  it("passes the granted WebSerial port id into the connect request", () => {
    expect(
      buildConnectRequest(webSerialDescriptor, {
        baud: 115200,
        port_id: "webserial:1",
      }),
    ).toEqual({
      transport: {
        kind: "web_serial",
        baud: 115200,
        port_id: "webserial:1",
      },
    });
  });

  it("passes the Nordic UART profile into native BLE connect requests", () => {
    expect(
      buildConnectRequest(bluetoothBleDescriptor, {
        address: "AA:BB:CC:DD:EE:FF",
      }),
    ).toEqual({
      transport: {
        kind: "bluetooth_ble",
        address: "AA:BB:CC:DD:EE:FF",
        profile: "nordic_uart",
      },
    });
  });
});
