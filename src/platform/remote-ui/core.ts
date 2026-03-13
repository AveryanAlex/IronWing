import { ensureSocket, getSocket, pendingInvokes } from "./socket";

let nextId = 0;
const INVOKE_TIMEOUT_MS = 30_000;

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await ensureSocket();
  const socket = getSocket();
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error("Remote UI WebSocket not connected");
  }

  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      delete pendingInvokes[id];
      reject(new Error(`invoke timeout: ${cmd}`));
    }, INVOKE_TIMEOUT_MS);

    pendingInvokes[id] = (response) => {
      clearTimeout(timer);
      if (response.status === "success") {
        resolve(response.payload as T);
      } else {
        reject(response.payload);
      }
    };

    socket.send(JSON.stringify({ id, cmd, args }));
  });
}
