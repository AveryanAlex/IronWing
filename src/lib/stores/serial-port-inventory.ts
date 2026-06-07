import { get, writable } from "svelte/store";

import {
  createSerialPortInventoryService,
  normalizeSerialPortInfo,
  normalizeSerialPortInventoryResult,
  toAppSerialPort,
  type AppSerialPort,
  type SerialPortInventoryService,
} from "../platform/serial-ports";

export type SerialPortInventoryPhase = "idle" | "refreshing" | "granting" | "ready" | "failed";

export type SerialPortInventoryState = {
  phase: SerialPortInventoryPhase;
  ports: AppSerialPort[];
  error: string | null;
  lastRefreshedAt: number | null;
  canGrantWebSerial: boolean;
};

function initialSerialPortInventoryState(): SerialPortInventoryState {
  return {
    phase: "idle",
    ports: [],
    error: null,
    lastRefreshedAt: null,
    canGrantWebSerial: false,
  };
}

export function createSerialPortInventoryStore(
  service: SerialPortInventoryService = createSerialPortInventoryService(),
) {
  const store = writable<SerialPortInventoryState>(initialSerialPortInventoryState());

  async function refresh(): Promise<void> {
    store.update((state) => ({
      ...state,
      phase: "refreshing",
      error: null,
    }));

    try {
      const result = normalizeSerialPortInventoryResult(await service.listPorts());
      store.update((state) => ({
        ...state,
        phase: "ready",
        ports: result.kind === "available" ? result.ports.map(toAppSerialPort) : [],
        error: null,
        lastRefreshedAt: Date.now(),
        canGrantWebSerial: result.can_request_web_serial,
      }));
    } catch (error) {
      store.update((state) => ({
        ...state,
        phase: "failed",
        error: service.formatError(error),
      }));
    }
  }

  async function grantWebSerialPort(): Promise<AppSerialPort | null> {
    store.update((state) => ({
      ...state,
      phase: "granting",
      error: null,
    }));

    try {
      const requested = await service.requestWebSerialPort();
      const requestedPort = requested ? toAppSerialPort(normalizeSerialPortInfo(requested)) : null;
      await refresh();
      if (!requestedPort) {
        return null;
      }

      return get(store).ports.find((port) => port.portName === requestedPort.portName) ?? requestedPort;
    } catch (error) {
      store.update((state) => ({
        ...state,
        phase: "failed",
        error: service.formatError(error),
      }));
      return null;
    }
  }

  function findById(id: string): AppSerialPort | null {
    return get(store).ports.find((port) => port.id === id) ?? null;
  }

  function nativePorts(): AppSerialPort[] {
    return get(store).ports.filter((port) => port.source === "native");
  }

  function webSerialPorts(): AppSerialPort[] {
    return get(store).ports.filter((port) => port.source === "web_serial");
  }

  function reset(): void {
    store.set(initialSerialPortInventoryState());
  }

  return {
    subscribe: store.subscribe,
    refresh,
    grantWebSerialPort,
    findById,
    nativePorts,
    webSerialPorts,
    reset,
  };
}

export type SerialPortInventoryStore = ReturnType<typeof createSerialPortInventoryStore>;
