import path from "node:path";
import { isTcpPortFree, runtimeEnv } from "./runtime.mjs";
import { findFreeTcpPort } from "./ports.mjs";
import { sitlTcpEnv } from "./env.mjs";

export const NATIVE_E2E_WEBDRIVER_HOST = "127.0.0.1";
export const NATIVE_E2E_WEBDRIVER_PORT = 4444;
export const NATIVE_E2E_NATIVE_DRIVER_PORT = 4445;

export function nativeE2eBuildEnv(runtime) {
  return {
    ...runtimeEnv(runtime),
    ...sitlTcpEnv(runtime),
  };
}

export function nativeE2eApplicationPath(
  projectRoot,
  mainBinaryName,
  { platform = process.platform, cargoTargetDir } = {},
) {
  const executableName = platform === "win32" ? `${mainBinaryName}.exe` : mainBinaryName;
  const baseDir = cargoTargetDir ?? path.join(projectRoot, "target");

  return path.join(baseDir, "debug", executableName);
}

export async function resolveNativeE2eDriverPort({
  host = NATIVE_E2E_WEBDRIVER_HOST,
  defaultPort = NATIVE_E2E_WEBDRIVER_PORT,
  maxPort = defaultPort + 20,
  isPortFree = isTcpPortFree,
} = {}) {
  return findFreeTcpPort({
    host,
    defaultPort,
    maxPort,
    isPortFree,
    description: "native E2E WebDriver port",
  });
}
