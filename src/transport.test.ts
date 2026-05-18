import { describe, expect, it } from "vitest";

import {
  buildConnectRequest,
  type DemoTransportDescriptor,
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
});
