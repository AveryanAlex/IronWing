import { describe, expect, it } from "vitest";

import {
  DEFAULT_TCP_ADDRESS,
  defaultTcpAddress,
  isAutoConnectSitlEnabled,
  loadConnectionForm,
  resolveSessionConnectionDefaults,
  resolveSitlMode,
  type SessionConnectionFormState,
} from "./session";

describe("isAutoConnectSitlEnabled", () => {
  it("returns true when VITE_IRONWING_AUTO_CONNECT_SITL is '1' or 'true'", () => {
    expect(isAutoConnectSitlEnabled({ VITE_IRONWING_AUTO_CONNECT_SITL: "1" })).toBe(true);
    expect(isAutoConnectSitlEnabled({ VITE_IRONWING_AUTO_CONNECT_SITL: "true" })).toBe(true);
  });

  it("returns false for other values or missing env", () => {
    expect(isAutoConnectSitlEnabled({ VITE_IRONWING_AUTO_CONNECT_SITL: "0" })).toBe(false);
    expect(isAutoConnectSitlEnabled({ VITE_IRONWING_AUTO_CONNECT_SITL: "false" })).toBe(false);
    expect(isAutoConnectSitlEnabled({ VITE_IRONWING_AUTO_CONNECT_SITL: "" })).toBe(false);
    expect(isAutoConnectSitlEnabled({})).toBe(false);
  });
});

describe("resolveSitlMode", () => {
  it("preselects tcp only for the supported SITL mode", () => {
    expect(resolveSitlMode("tcp")).toBe("tcp");
    expect(resolveSitlMode("udp")).toBe("udp");
    expect(resolveSitlMode("serial")).toBe("udp");
    expect(resolveSitlMode("bogus")).toBe("udp");
    expect(resolveSitlMode(undefined)).toBe("udp");
  });
});

describe("defaultTcpAddress", () => {
  it("uses the configured SITL tcp port when it is valid", () => {
    expect(defaultTcpAddress({ VITE_IRONWING_SITL_TCP_PORT: "5771" })).toBe("127.0.0.1:5771");
  });

  it("falls back to the shipped tcp address for invalid port values", () => {
    expect(defaultTcpAddress({ VITE_IRONWING_SITL_TCP_PORT: "" })).toBe(DEFAULT_TCP_ADDRESS);
    expect(defaultTcpAddress({ VITE_IRONWING_SITL_TCP_PORT: "0" })).toBe(DEFAULT_TCP_ADDRESS);
    expect(defaultTcpAddress({ VITE_IRONWING_SITL_TCP_PORT: "-1" })).toBe(DEFAULT_TCP_ADDRESS);
    expect(defaultTcpAddress({ VITE_IRONWING_SITL_TCP_PORT: "not-a-port" })).toBe(DEFAULT_TCP_ADDRESS);
  });
});

describe("resolveSessionConnectionDefaults", () => {
  it("preseeds the shipped shell to tcp for native and dev SITL builds", () => {
    expect(
      resolveSessionConnectionDefaults({
        VITE_IRONWING_SITL_MODE: "tcp",
        VITE_IRONWING_SITL_TCP_PORT: "5768",
      }),
    ).toMatchObject({
      mode: "tcp",
      tcpAddress: "127.0.0.1:5768",
      udpBind: "0.0.0.0:14550",
      baud: 57600,
    });
  });

  it("uses demo-mode defaults for the public mock profile", () => {
    expect(
      resolveSessionConnectionDefaults({
        VITE_IRONWING_MOCK_PROFILE: "demo",
      }),
    ).toMatchObject({
      mode: "demo",
      demoVehiclePreset: "quadcopter",
    });
  });

  it("falls back predictably when the SITL mode or tcp port is malformed", () => {
    expect(
      resolveSessionConnectionDefaults({
        VITE_IRONWING_SITL_MODE: "serial",
        VITE_IRONWING_SITL_TCP_PORT: "bad-port",
      }),
    ).toMatchObject({
      mode: "udp",
      tcpAddress: DEFAULT_TCP_ADDRESS,
    });

    expect(
      resolveSessionConnectionDefaults({
        VITE_IRONWING_SITL_MODE: "tcp",
        VITE_IRONWING_SITL_TCP_PORT: "bad-port",
      }),
    ).toMatchObject({
      mode: "tcp",
      tcpAddress: DEFAULT_TCP_ADDRESS,
    });
  });
});

describe("loadConnectionForm", () => {
  const defaults: SessionConnectionFormState = resolveSessionConnectionDefaults({
    VITE_IRONWING_SITL_MODE: "tcp",
    VITE_IRONWING_SITL_TCP_PORT: "5769",
  });

  it("merges persisted values onto the env-aware defaults", () => {
    const storage = {
      getItem: () => JSON.stringify({ followVehicle: false, takeoffAlt: "20" }),
    };

    expect(loadConnectionForm(storage, defaults)).toEqual({
      ...defaults,
      followVehicle: false,
      takeoffAlt: "20",
    });
  });

  it("pins TCP mode and address to the env-aware defaults for SITL-native builds", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          mode: "serial",
          tcpAddress: "127.0.0.1:9999",
          serialPort: "/dev/ttyUSB0",
          followVehicle: false,
        }),
    };

    expect(loadConnectionForm(storage, defaults)).toEqual({
      ...defaults,
      serialPort: "/dev/ttyUSB0",
      followVehicle: false,
    });
  });

  it("falls back to the provided defaults when persisted state is malformed", () => {
    const storage = {
      getItem: () => "{not-json",
    };

    expect(loadConnectionForm(storage, defaults)).toEqual(defaults);
  });

  it("pins demo profile storage back to demo mode and normalizes invalid presets", () => {
    const demoDefaults = resolveSessionConnectionDefaults({
      VITE_IRONWING_MOCK_PROFILE: "demo",
    });
    const storage = {
      getItem: () =>
        JSON.stringify({
          mode: "tcp",
          tcpAddress: "127.0.0.1:9999",
          demoVehiclePreset: "boat",
          takeoffAlt: "20",
          followVehicle: false,
        }),
    };

    expect(loadConnectionForm(storage, demoDefaults)).toMatchObject({
      mode: "demo",
      demoVehiclePreset: "quadcopter",
      takeoffAlt: "20",
      followVehicle: false,
    });
  });

  it("normalizes persisted demo mode back to the current non-demo profile default", () => {
    const nonDemoDefaults = resolveSessionConnectionDefaults({
      VITE_IRONWING_SITL_MODE: "udp",
    });
    const storage = {
      getItem: () =>
        JSON.stringify({
          mode: "demo",
          demoVehiclePreset: "quadplane",
          udpBind: "127.0.0.1:14551",
          followVehicle: false,
        }),
    };

    expect(loadConnectionForm(storage, nonDemoDefaults)).toMatchObject({
      mode: nonDemoDefaults.mode,
      udpBind: "127.0.0.1:14551",
      followVehicle: false,
    });
  });

  it("normalizes persisted values and ignores invalid field types", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          mode: "udp",
          udpBind: 14550,
          tcpAddress: "127.0.0.1:9999",
          serialPort: "/dev/ttyUSB0",
          baud: "57600",
          selectedBtDevice: "AA:BB:CC",
          takeoffAlt: 20,
          followVehicle: false,
        }),
    };

    expect(loadConnectionForm(storage, defaults)).toEqual({
      ...defaults,
      serialPort: "/dev/ttyUSB0",
      selectedBtDevice: "AA:BB:CC",
      followVehicle: false,
    });
  });
});
