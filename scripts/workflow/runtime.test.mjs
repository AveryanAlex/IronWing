import { describe, expect, it } from "vitest";
import { findFreeInstance, runtimeForInstance, runtimeEnv } from "./runtime.mjs";

describe("runtimeForInstance", () => {
  it("uses the baseline ports and names for instance 0", () => {
    expect(runtimeForInstance(0)).toEqual({
      instanceId: 0,
      remoteUiPort: 9515,
      sitlTcpPort: 5760,
      sitlUdpPort: 14550,
      wrongUdpPort: 14551,
      sitlContainer: "ardupilot-sitl",
      baseUrl: "http://127.0.0.1:9515",
      livenessUrl: "http://127.0.0.1:9515/keep_alive",
      tcpAddress: "127.0.0.1:5760",
      udpBindAddress: "0.0.0.0:14550",
      wrongUdpBindAddress: "0.0.0.0:14551",
    });
  });

  it("offsets ports and container names for non-zero instances", () => {
    expect(runtimeForInstance(3)).toEqual({
      instanceId: 3,
      remoteUiPort: 9518,
      sitlTcpPort: 5763,
      sitlUdpPort: 14580,
      wrongUdpPort: 14581,
      sitlContainer: "ardupilot-sitl-3",
      baseUrl: "http://127.0.0.1:9518",
      livenessUrl: "http://127.0.0.1:9518/keep_alive",
      tcpAddress: "127.0.0.1:5763",
      udpBindAddress: "0.0.0.0:14580",
      wrongUdpBindAddress: "0.0.0.0:14581",
    });
  });
});

describe("runtimeEnv", () => {
  it("serializes the runtime for child-process environments", () => {
    expect(runtimeEnv(runtimeForInstance(2))).toEqual({
      E2E_INSTANCE_ID: "2",
      E2E_REMOTE_UI_PORT: "9517",
      E2E_SITL_TCP_PORT: "5762",
      E2E_SITL_UDP_PORT: "14570",
      E2E_SITL_CONTAINER: "ardupilot-sitl-2",
      E2E_LIVENESS_URL: "http://127.0.0.1:9517/keep_alive",
    });
  });
});

describe("findFreeInstance", () => {
  it("returns the first instance whose tcp and udp ports are all free", async () => {
    const busyTcpPorts = new Set([9515, 5760, 5761]);
    const busyUdpPorts = new Set([14550, 14551, 14560]);

    const runtime = await findFreeInstance({
      maxInstanceId: 4,
      isTcpPortFree: async (_host, port) => !busyTcpPorts.has(port),
      isUdpPortFree: async (_host, port) => !busyUdpPorts.has(port),
    });

    expect(runtime.instanceId).toBe(2);
    expect(runtime.sitlTcpPort).toBe(5762);
    expect(runtime.remoteUiPort).toBe(9517);
    expect(runtime.sitlUdpPort).toBe(14570);
  });
});
