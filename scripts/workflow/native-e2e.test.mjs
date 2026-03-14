import path from "node:path";
import { describe, expect, it } from "vitest";
import { runtimeForInstance } from "./runtime.mjs";
import {
  nativeE2eApplicationPath,
  nativeE2eBuildEnv,
  resolveNativeE2eDriverPort,
} from "./native-e2e.mjs";

describe("nativeE2eBuildEnv", () => {
  it("adds SITL TCP defaults on top of the runtime environment", () => {
    const runtime = runtimeForInstance(4);

    expect(nativeE2eBuildEnv(runtime)).toEqual({
      E2E_INSTANCE_ID: "4",
      E2E_SITL_TCP_PORT: "5764",
      E2E_SITL_UDP_PORT: "14590",
      E2E_SITL_CONTAINER: "ardupilot-sitl-4",
      VITE_IRONWING_SITL_MODE: "tcp",
      VITE_IRONWING_SITL_TCP_PORT: "5764",
    });
  });
});

describe("nativeE2eApplicationPath", () => {
  it("resolves the Linux debug binary path from the Tauri main binary name", () => {
    expect(
      nativeE2eApplicationPath("/tmp/ironwing", "ironwing-app", { platform: "linux" }),
    ).toBe(path.join("/tmp/ironwing", "src-tauri", "target", "debug", "ironwing-app"));
  });

  it("adds the Windows executable suffix when needed", () => {
    expect(
      nativeE2eApplicationPath("C:/IronWing", "ironwing-app", { platform: "win32" }),
    ).toBe(path.join("C:/IronWing", "src-tauri", "target", "debug", "ironwing-app.exe"));
  });

  it("prefers an explicit cargo target directory when one is configured", () => {
    expect(
      nativeE2eApplicationPath("/tmp/ironwing", "ironwing-app", {
        platform: "linux",
        cargoTargetDir: "/tmp/cargo-target",
      }),
    ).toBe(path.join("/tmp/cargo-target", "debug", "ironwing-app"));
  });
});

describe("resolveNativeE2eDriverPort", () => {
  it("uses the preferred driver port when it is free", async () => {
    const port = await resolveNativeE2eDriverPort({
      defaultPort: 4510,
      maxPort: 4512,
      isPortFree: async (_host, candidatePort) => candidatePort === 4510,
    });

    expect(port).toBe(4510);
  });

  it("scans forward until it finds a free driver port", async () => {
    const port = await resolveNativeE2eDriverPort({
      defaultPort: 4510,
      maxPort: 4512,
      isPortFree: async (_host, candidatePort) => candidatePort === 4512,
    });

    expect(port).toBe(4512);
  });
});
