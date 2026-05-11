import { describe, expect, it } from "vitest";

import {
  buildConnectRequest,
  type DemoTransportDescriptor,
  validateTransportDescriptor,
} from "./transport";

const demoDescriptor: DemoTransportDescriptor = {
  kind: "demo",
  label: "Demo",
  available: true,
  validation: {},
};

describe("validateTransportDescriptor", () => {
  it("accepts demo transport without address-like fields", () => {
    expect(
      validateTransportDescriptor(demoDescriptor, {
        demo_vehicle_preset: "quadcopter",
      }),
    ).toEqual([]);
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
});
