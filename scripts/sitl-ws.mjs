import net from "node:net";
import { WebSocketServer } from "ws";

function readNumberFlag(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number.parseInt(process.argv[index + 1] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStringFlag(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const tcpHost = readStringFlag("--tcp-host", "127.0.0.1");
const tcpPort = readNumberFlag("--tcp-port", Number.parseInt(process.env.VITE_IRONWING_SITL_TCP_PORT ?? "5760", 10));
const wsHost = readStringFlag("--ws-host", "127.0.0.1");
const wsPort = readNumberFlag("--ws-port", 14560);

const server = new WebSocketServer({ host: wsHost, port: wsPort });

server.on("connection", (socket) => {
  const tcp = net.createConnection({ host: tcpHost, port: tcpPort });

  tcp.on("data", (chunk) => {
    if (socket.readyState === socket.OPEN) {
      socket.send(chunk);
    }
  });

  tcp.on("error", () => {
    socket.close();
  });

  tcp.on("close", () => {
    socket.close();
  });

  socket.on("message", (data, isBinary) => {
    const payload = isBinary ? data : Buffer.from(String(data));
    tcp.write(payload);
  });

  socket.on("close", () => {
    tcp.destroy();
  });

  socket.on("error", () => {
    tcp.destroy();
  });
});

server.on("listening", () => {
  console.log(`SITL WebSocket bridge listening on ws://${wsHost}:${wsPort} -> tcp://${tcpHost}:${tcpPort}`);
});
