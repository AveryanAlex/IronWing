import { describe, expect, it } from "vitest";

import {
  buildConnectRequest,
  describeTransportAvailability,
  validateTransportDescriptor,
} from "../transport";
import { selectVehiclePosition } from "./session-selectors";

describe("session selectors and connect workflow", () => {
  it("selects vehicle position from grouped telemetry navigation data", () => {
    expect(
      selectVehiclePosition({
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          flight: {},
          navigation: { latitude_deg: 47.3, longitude_deg: 8.55, heading_deg: 123 },
          gps: {},
        },
      }),
    ).toEqual({ latitude_deg: 47.3, longitude_deg: 8.55, heading_deg: 123 });
  });

  it("exposes typed transport descriptors with availability and validation/discovery errors", () => {
    const descriptor = {
      kind: "serial",
      label: "USB Serial",
      available: false,
      discovery_error: "permission denied",
      validation: { port_required: true, baud_required: true },
      default_baud: 115200,
    } as const;

    expect(describeTransportAvailability(descriptor)).toContain("permission denied");
    expect(validateTransportDescriptor(descriptor, { port: "", baud: null })).toEqual([
      "port is required",
      "baud is required",
    ]);
    expect(
      buildConnectRequest(descriptor, { port: "/dev/ttyACM0", baud: 57600 }),
    ).toEqual({ transport: { kind: "serial", port: "/dev/ttyACM0", baud: 57600 } });
  });
});
