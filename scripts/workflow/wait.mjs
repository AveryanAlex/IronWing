import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function canConnect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    socket.setTimeout(1_000);
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${host}:${port}`));
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

export async function waitForTcp(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await canConnect(host, port);
      return;
    } catch {
      await delay(1_000);
    }
  }

  throw new Error(`Timed out waiting for TCP endpoint ${host}:${port}`);
}

export async function waitForHttpOk(url, { timeoutMs, isStillRunning = () => true } = {}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isStillRunning()) {
      throw new Error(`Process exited while waiting for ${url}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await delay(1_000);
  }

  throw new Error(`Timed out waiting for HTTP readiness at ${url}`);
}
