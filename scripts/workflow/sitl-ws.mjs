import net from "node:net";
import { WebSocket, WebSocketServer } from "ws";
import { DEFAULT_SITL_TCP_PORT } from "./runtime.mjs";

export const DEFAULT_SITL_WS_HOST = "127.0.0.1";
export const DEFAULT_SITL_WS_PORT = 14560;
export const DEFAULT_SITL_TCP_HOST = "127.0.0.1";

function readFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return argv[index + 1];
}

function readStringFlag(argv, flag, fallback) {
  return readFlagValue(argv, flag) ?? fallback;
}

function parsePort(value, name) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port for ${name}: ${value}`);
  }

  return parsed;
}

function readPortFlag(argv, flag, fallback) {
  const value = readFlagValue(argv, flag);
  return value === undefined ? fallback : parsePort(value, flag);
}

function optionalEnvPort(env, name) {
  const value = env[name];
  return value == null || value === "" ? undefined : parsePort(value, name);
}

function runtimeWithTcpPort(runtime, sitlTcpPort) {
  return {
    ...runtime,
    sitlTcpPort,
    tcpAddress: `127.0.0.1:${sitlTcpPort}`,
  };
}

export function resolveSitlWsConfig({ argv = process.argv.slice(2), env = process.env, runtime } = {}) {
  if (!runtime) {
    throw new Error("resolveSitlWsConfig requires a resolved runtime");
  }

  const startSitl = !argv.includes("--no-sitl");
  const envTcpPort = optionalEnvPort(env, "VITE_IRONWING_SITL_TCP_PORT");
  const tcpPort = readPortFlag(
    argv,
    "--tcp-port",
    startSitl ? (envTcpPort ?? runtime.sitlTcpPort) : (envTcpPort ?? DEFAULT_SITL_TCP_PORT),
  );
  const wsPort = readPortFlag(
    argv,
    "--ws-port",
    optionalEnvPort(env, "VITE_IRONWING_SITL_WS_PORT") ?? DEFAULT_SITL_WS_PORT,
  );
  const tcpHost = readStringFlag(argv, "--tcp-host", DEFAULT_SITL_TCP_HOST);
  const wsHost = readStringFlag(argv, "--ws-host", DEFAULT_SITL_WS_HOST);

  return {
    startSitl,
    runtime: startSitl ? runtimeWithTcpPort(runtime, tcpPort) : runtime,
    tcpHost,
    tcpPort,
    wsHost,
    wsPort,
  };
}

function rawWebSocketPayload(data) {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  return Buffer.from(data);
}

export function createSitlWebSocketBridge({ tcpHost, tcpPort, wsHost, wsPort }) {
  const server = new WebSocketServer({ host: wsHost, port: wsPort });
  const connections = new Set();

  server.on("connection", (socket) => {
    const tcp = net.createConnection({ host: tcpHost, port: tcpPort });
    const connection = { socket, tcp };
    connections.add(connection);

    function closeBoth() {
      connections.delete(connection);
      tcp.destroy();
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    tcp.on("data", (chunk) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(chunk);
      }
    });

    tcp.on("error", closeBoth);
    tcp.on("close", closeBoth);

    socket.on("message", (data, isBinary) => {
      if (tcp.destroyed) {
        return;
      }

      const payload = isBinary ? rawWebSocketPayload(data) : Buffer.from(String(data));
      tcp.write(payload);
    });

    socket.on("close", closeBoth);
    socket.on("error", closeBoth);
  });

  return {
    server,
    async close() {
      for (const { socket, tcp } of connections) {
        tcp.destroy();
        socket.terminate();
      }
      connections.clear();

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

export function waitForBridgeListening(server) {
  if (server.address()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
}
