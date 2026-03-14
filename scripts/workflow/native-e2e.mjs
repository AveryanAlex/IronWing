import path from "node:path";
import { isTcpPortFree, runtimeEnv } from "./runtime.mjs";

export const NATIVE_E2E_WEBDRIVER_HOST = "127.0.0.1";
export const NATIVE_E2E_WEBDRIVER_PORT = 4444;
export const NATIVE_E2E_NATIVE_DRIVER_PORT = 4445;

export function nativeE2eBuildEnv(runtime) {
  return {
    ...runtimeEnv(runtime),
    VITE_IRONWING_SITL_MODE: "tcp",
    VITE_IRONWING_SITL_TCP_PORT: String(runtime.sitlTcpPort),
  };
}

export function nativeE2eApplicationPath(
  projectRoot,
  mainBinaryName,
  { platform = process.platform, cargoTargetDir } = {},
) {
  const executableName = platform === "win32" ? `${mainBinaryName}.exe` : mainBinaryName;
  const baseDir = cargoTargetDir ?? path.join(projectRoot, "src-tauri", "target");

  return path.join(baseDir, "debug", executableName);
}

export async function resolveNativeE2eDriverPort({
  host = NATIVE_E2E_WEBDRIVER_HOST,
  defaultPort = NATIVE_E2E_WEBDRIVER_PORT,
  maxPort = defaultPort + 20,
  isPortFree = isTcpPortFree,
} = {}) {
  for (let candidatePort = defaultPort; candidatePort <= maxPort; candidatePort += 1) {
    if (await isPortFree(host, candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(`No free native E2E WebDriver port found in range ${defaultPort}-${maxPort}`);
}
