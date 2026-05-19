import { describe, expect, it } from "vitest";
import { runtimeForInstance } from "./runtime.mjs";
import { resolveSitlWsConfig } from "./sitl-ws.mjs";

describe("resolveSitlWsConfig", () => {
  it("starts managed SITL by default and bridges the selected runtime TCP port", () => {
    const runtime = runtimeForInstance(2);

    expect(resolveSitlWsConfig({ argv: [], env: {}, runtime })).toEqual({
      startSitl: true,
      runtime,
      tcpHost: "127.0.0.1",
      tcpPort: 5762,
      wsHost: "127.0.0.1",
      wsPort: 14560,
    });
  });

  it("keeps proxy-only mode available for an externally managed SITL", () => {
    const runtime = runtimeForInstance(0);

    expect(resolveSitlWsConfig({
      argv: ["--no-sitl", "--tcp-host", "192.0.2.10", "--tcp-port", "5770", "--ws-port", "14570"],
      env: {},
      runtime,
    })).toEqual({
      startSitl: false,
      runtime,
      tcpHost: "192.0.2.10",
      tcpPort: 5770,
      wsHost: "127.0.0.1",
      wsPort: 14570,
    });
  });

  it("honors environment and flag port overrides", () => {
    const runtime = runtimeForInstance(1);

    expect(resolveSitlWsConfig({
      argv: ["--tcp-port", "5800", "--ws-host", "0.0.0.0"],
      env: { VITE_IRONWING_SITL_TCP_PORT: "5790", VITE_IRONWING_SITL_WS_PORT: "14580" },
      runtime,
    })).toEqual({
      startSitl: true,
      runtime: {
        ...runtime,
        sitlTcpPort: 5800,
        tcpAddress: "127.0.0.1:5800",
      },
      tcpHost: "127.0.0.1",
      tcpPort: 5800,
      wsHost: "0.0.0.0",
      wsPort: 14580,
    });
  });
});
