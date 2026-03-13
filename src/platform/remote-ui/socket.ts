let ws: WebSocket | null = null;
let wsReadyPromise: Promise<void> | null = null;

export const listeners = new EventTarget();
export const pendingInvokes: Record<number, (response: { status: string; payload: unknown }) => void> = {};

function getWsUrl(): string {
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${loc.host}/remote_ui_ws`;
}

export function ensureSocket(): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (wsReadyPromise) return wsReadyPromise;

  wsReadyPromise = new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(getWsUrl());

    socket.onopen = () => {
      ws = socket;
      socket.send("ping");
      setInterval(() => socket.send("ping"), 10_000);
      resolve();
    };

    socket.onmessage = ({ data }) => {
      if (data === "pong") return;
      const msg = JSON.parse(data);
      if (msg.id && pendingInvokes[msg.id]) {
        pendingInvokes[msg.id](JSON.parse(msg.payload));
        delete pendingInvokes[msg.id];
      } else {
        listeners.dispatchEvent(new MessageEvent(msg.event, { data: msg }));
      }
    };

    socket.onclose = () => {
      ws = null;
      wsReadyPromise = null;
    };

    socket.onerror = (e) => reject(e);
  });

  return wsReadyPromise;
}

export function getSocket(): WebSocket | null {
  return ws;
}
