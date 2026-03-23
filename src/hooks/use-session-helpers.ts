import type { LinkState } from "../telemetry";
import type { SessionState } from "../session";
import type { TransportType } from "../transport";

export const CONNECTION_KEY = "mpng_connection";

export type ConnectionFormState = {
  mode: TransportType;
  udpBind: string;
  tcpAddress: string;
  serialPort: string;
  baud: number;
  selectedBtDevice: string;
  takeoffAlt: string;
  followVehicle: boolean;
};

function defaultTcpAddress() {
  const port = Number.parseInt(import.meta.env.VITE_IRONWING_SITL_TCP_PORT ?? "", 10);
  if (Number.isFinite(port) && port > 0) {
    return `127.0.0.1:${port}`;
  }

  return "127.0.0.1:5760";
}

const CONNECTION_DEFAULTS: ConnectionFormState = {
  mode: "udp",
  udpBind: "0.0.0.0:14550",
  tcpAddress: defaultTcpAddress(),
  serialPort: "",
  baud: 57600,
  selectedBtDevice: "",
  takeoffAlt: "10",
  followVehicle: true,
};

export function loadConnectionForm(): ConnectionFormState {
  try {
    const raw = localStorage.getItem(CONNECTION_KEY);
    return raw ? { ...CONNECTION_DEFAULTS, ...JSON.parse(raw) } : CONNECTION_DEFAULTS;
  } catch {
    // Invalid persisted state should not block session bootstrap.
    return CONNECTION_DEFAULTS;
  }
}

export function persistConnectionForm(state: ConnectionFormState) {
  try {
    localStorage.setItem(CONNECTION_KEY, JSON.stringify(state));
  } catch {
    // Test environments may provide a partial localStorage shim.
  }
}

export function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export function toLinkState(connection: SessionState["connection"] | undefined): LinkState | null {
  if (!connection) return null;
  switch (connection.kind) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "disconnected";
    case "error":
      return { error: connection.error };
  }
}
