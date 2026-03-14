import dgram from "node:dgram";
import net from "node:net";

export const DEFAULT_SITL_TCP_PORT = 5760;
export const DEFAULT_SITL_UDP_PORT = 14550;
export const UDP_PORT_STRIDE = 10;
export const MAX_INSTANCE_ID = 100;
export const SITL_IMAGE =
  "radarku/ardupilot-sitl:eff32c1f98152ac3d1dc09a1e475733b73ce569f";
export const SITL_DEFAULTS = "/ardupilot/Tools/autotest/default_params/copter.parm";
export const SITL_HOME = "42.3898,-71.1476,14.0,270.0";

function parseInteger(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }

  return parsed;
}

function parseOptionalInteger(value, name) {
  if (value == null || value === "") {
    return undefined;
  }

  return parseInteger(value, name);
}

function closeUdpSocket(socket) {
  return new Promise((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
}

export function runtimeForInstance(instanceId, overrides = {}) {
  const normalizedInstanceId = parseInteger(instanceId, "instanceId");
  const sitlTcpPort = overrides.sitlTcpPort ?? DEFAULT_SITL_TCP_PORT + normalizedInstanceId;
  const sitlUdpPort =
    overrides.sitlUdpPort ?? DEFAULT_SITL_UDP_PORT + normalizedInstanceId * UDP_PORT_STRIDE;
  const wrongUdpPort = sitlUdpPort + 1;
  const sitlContainer =
    overrides.sitlContainer ??
    (normalizedInstanceId === 0 ? "ardupilot-sitl" : `ardupilot-sitl-${normalizedInstanceId}`);

  return {
    instanceId: normalizedInstanceId,
    sitlTcpPort,
    sitlUdpPort,
    wrongUdpPort,
    sitlContainer,
    tcpAddress: `127.0.0.1:${sitlTcpPort}`,
    udpBindAddress: `0.0.0.0:${sitlUdpPort}`,
    wrongUdpBindAddress: `0.0.0.0:${wrongUdpPort}`,
  };
}

export function resolveRuntimeFromEnv(env = process.env) {
  const instanceId =
    parseOptionalInteger(env.IRONWING_INSTANCE_ID, "IRONWING_INSTANCE_ID") ??
    parseOptionalInteger(env.E2E_INSTANCE_ID, "E2E_INSTANCE_ID") ??
    0;

  return runtimeForInstance(instanceId, {
    sitlTcpPort: parseOptionalInteger(env.E2E_SITL_TCP_PORT, "E2E_SITL_TCP_PORT"),
    sitlUdpPort: parseOptionalInteger(env.E2E_SITL_UDP_PORT, "E2E_SITL_UDP_PORT"),
    sitlContainer: env.E2E_SITL_CONTAINER?.trim() || undefined,
  });
}

export function runtimeEnv(runtime) {
  return {
    E2E_INSTANCE_ID: String(runtime.instanceId),
    E2E_SITL_TCP_PORT: String(runtime.sitlTcpPort),
    E2E_SITL_UDP_PORT: String(runtime.sitlUdpPort),
    E2E_SITL_CONTAINER: runtime.sitlContainer,
  };
}

export async function isTcpPortFree(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function isUdpPortFree(host, port) {
  const socket = dgram.createSocket("udp4");
  socket.unref();

  return new Promise((resolve) => {
    socket.once("error", async () => {
      await closeUdpSocket(socket);
      resolve(false);
    });
    socket.bind(port, host, async () => {
      await closeUdpSocket(socket);
      resolve(true);
    });
  });
}

export async function findFreeInstance({
  maxInstanceId = MAX_INSTANCE_ID,
  isTcpPortFree: checkTcpPort = isTcpPortFree,
  isUdpPortFree: checkUdpPort = isUdpPortFree,
} = {}) {
  for (let instanceId = 0; instanceId <= maxInstanceId; instanceId += 1) {
    const runtime = runtimeForInstance(instanceId);
    const tcpFree = await Promise.all([checkTcpPort("127.0.0.1", runtime.sitlTcpPort)]);
    const udpFree = await Promise.all([
      checkUdpPort("0.0.0.0", runtime.sitlUdpPort),
      checkUdpPort("0.0.0.0", runtime.wrongUdpPort),
    ]);

    if ([...tcpFree, ...udpFree].every(Boolean)) {
      return runtime;
    }
  }

  throw new Error(`No free IronWing instance found in range 0-${maxInstanceId}`);
}

export async function resolveRequestedRuntime(env = process.env) {
  if (env.IRONWING_INSTANCE_ID || env.E2E_INSTANCE_ID) {
    return resolveRuntimeFromEnv(env);
  }

  return findFreeInstance();
}
