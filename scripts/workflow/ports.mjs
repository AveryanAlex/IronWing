import net from "node:net";

export async function reserveFreeTcpPort(host = "127.0.0.1") {
  const server = net.createServer();

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function findFreeTcpPort({
  host = "127.0.0.1",
  defaultPort,
  maxPort = defaultPort,
  isPortFree,
  description = "TCP port",
} = {}) {
  for (let candidatePort = defaultPort; candidatePort <= maxPort; candidatePort += 1) {
    if (await isPortFree(host, candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(`No free ${description} found in range ${defaultPort}-${maxPort}`);
}
