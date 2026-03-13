import { describe, expect, it } from "vitest";
import { resolveE2ERuntime } from "./e2e-runtime";

describe("resolveE2ERuntime", () => {
  it("keeps the current single-run defaults for instance 0", () => {
    const runtime = resolveE2ERuntime({});

    expect(runtime.instanceId).toBe(0);
    expect(runtime.remoteUiPort).toBe(9515);
    expect(runtime.sitlTcpPort).toBe(5760);
    expect(runtime.sitlUdpPort).toBe(14550);
    expect(runtime.wrongUdpPort).toBe(14551);
    expect(runtime.sitlContainer).toBe("ardupilot-sitl");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:9515");
    expect(runtime.livenessUrl).toBe("http://127.0.0.1:9515/keep_alive");
    expect(runtime.tcpAddress).toBe("127.0.0.1:5760");
    expect(runtime.udpBindAddress).toBe("0.0.0.0:14550");
    expect(runtime.wrongUdpBindAddress).toBe("0.0.0.0:14551");
  });

  it("derives an isolated resource bundle from a non-zero instance id", () => {
    const runtime = resolveE2ERuntime({ E2E_INSTANCE_ID: "3" });

    expect(runtime.instanceId).toBe(3);
    expect(runtime.remoteUiPort).toBe(9518);
    expect(runtime.sitlTcpPort).toBe(5763);
    expect(runtime.sitlUdpPort).toBe(14580);
    expect(runtime.wrongUdpPort).toBe(14581);
    expect(runtime.sitlContainer).toBe("ardupilot-sitl-3");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:9518");
    expect(runtime.livenessUrl).toBe("http://127.0.0.1:9518/keep_alive");
    expect(runtime.tcpAddress).toBe("127.0.0.1:5763");
    expect(runtime.udpBindAddress).toBe("0.0.0.0:14580");
    expect(runtime.wrongUdpBindAddress).toBe("0.0.0.0:14581");
  });

  it("lets explicit overrides win over derived defaults", () => {
    const runtime = resolveE2ERuntime({
      E2E_INSTANCE_ID: "2",
      E2E_REMOTE_UI_PORT: "9700",
      E2E_SITL_TCP_PORT: "5900",
      E2E_SITL_UDP_PORT: "16000",
      E2E_SITL_CONTAINER: "sitl-custom",
      E2E_LIVENESS_URL: "http://127.0.0.1:9700/custom_keep_alive",
    });

    expect(runtime.remoteUiPort).toBe(9700);
    expect(runtime.sitlTcpPort).toBe(5900);
    expect(runtime.sitlUdpPort).toBe(16000);
    expect(runtime.wrongUdpPort).toBe(16001);
    expect(runtime.sitlContainer).toBe("sitl-custom");
    expect(runtime.baseUrl).toBe("http://127.0.0.1:9700");
    expect(runtime.livenessUrl).toBe("http://127.0.0.1:9700/custom_keep_alive");
    expect(runtime.tcpAddress).toBe("127.0.0.1:5900");
    expect(runtime.udpBindAddress).toBe("0.0.0.0:16000");
    expect(runtime.wrongUdpBindAddress).toBe("0.0.0.0:16001");
  });
});
