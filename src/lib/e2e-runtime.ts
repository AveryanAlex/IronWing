export type E2EEnvironment = Record<string, string | undefined>;

export type E2ERuntime = {
  instanceId: number;
  remoteUiPort: number;
  sitlTcpPort: number;
  sitlUdpPort: number;
  wrongUdpPort: number;
  sitlContainer: string;
  baseUrl: string;
  livenessUrl: string;
  tcpAddress: string;
  udpBindAddress: string;
  wrongUdpBindAddress: string;
};

const DEFAULT_REMOTE_UI_PORT = 9515;
const DEFAULT_SITL_TCP_PORT = 5760;
const DEFAULT_SITL_UDP_PORT = 14550;
const UDP_PORT_STRIDE = 10;

function parseIntegerEnv(env: E2EEnvironment, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }

  return parsed;
}

export function resolveE2ERuntime(env: E2EEnvironment): E2ERuntime {
  const instanceId = parseIntegerEnv(env, "E2E_INSTANCE_ID") ?? 0;
  const remoteUiPort =
    parseIntegerEnv(env, "E2E_REMOTE_UI_PORT") ??
    DEFAULT_REMOTE_UI_PORT + instanceId;
  const sitlTcpPort =
    parseIntegerEnv(env, "E2E_SITL_TCP_PORT") ?? DEFAULT_SITL_TCP_PORT + instanceId;
  const sitlUdpPort =
    parseIntegerEnv(env, "E2E_SITL_UDP_PORT") ??
    DEFAULT_SITL_UDP_PORT + instanceId * UDP_PORT_STRIDE;
  const wrongUdpPort = sitlUdpPort + 1;
  const sitlContainer =
    env.E2E_SITL_CONTAINER?.trim() ||
    (instanceId === 0 ? "ardupilot-sitl" : `ardupilot-sitl-${instanceId}`);
  const baseUrl = `http://127.0.0.1:${remoteUiPort}`;
  const tcpAddress = `127.0.0.1:${sitlTcpPort}`;

  return {
    instanceId,
    remoteUiPort,
    sitlTcpPort,
    sitlUdpPort,
    wrongUdpPort,
    sitlContainer,
    baseUrl,
    livenessUrl:
      env.E2E_LIVENESS_URL?.trim() || `${baseUrl}/keep_alive`,
    tcpAddress,
    udpBindAddress: `0.0.0.0:${sitlUdpPort}`,
    wrongUdpBindAddress: `0.0.0.0:${wrongUdpPort}`,
  };
}
