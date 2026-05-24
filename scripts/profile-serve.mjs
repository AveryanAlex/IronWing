import fs from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import { forwardedArgs } from "./workflow/paths.mjs";
import { createSpeedscopeUrl, parseArgs, resolvePath } from "./workflow/cpu-profile.mjs";

const DEFAULT_PORT = 8765;
const DEFAULT_HOST = "127.0.0.1";

const HELP = `Usage: node scripts/profile-serve.mjs --file <profile.cpuprofile> [options]

Serve a local CPU profile with CORS so it can be opened directly in Speedscope.

Options:
  --file <path>             Profile file to serve.
  --host <host>             Bind host. Default: ${DEFAULT_HOST}
  --port <port>             Bind port. Default: ${DEFAULT_PORT}
  --route <name>            URL path basename. Default: profile file basename
  --title <title>           Speedscope title. Default: CPU profile
  --help                    Show this message.
`;

const { options, positionals } = parseArgs(forwardedArgs());
if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const input = options.file ?? positionals[0];
if (!input) {
  console.error(HELP);
  process.exit(1);
}

const filePath = resolvePath(input);
if (!fs.existsSync(filePath)) {
  throw new Error(`Profile file does not exist: ${filePath}`);
}

const host = options.host ?? DEFAULT_HOST;
const port = parseIntOption(options.port, DEFAULT_PORT, "port");
const routeName = sanitizeRoute(options.route ?? path.basename(filePath));
const routePath = `/${routeName}`;
const title = options.title ?? path.basename(filePath);

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "*");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url !== "/" && request.url !== routePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  const stream = fs.createReadStream(filePath);
  stream.pipe(response);
  stream.on("error", (error) => {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(String(error));
  });
});

server.listen(port, host, () => {
  const profileUrl = `http://${host}:${port}${routePath}`;
  console.log(`Profile URL: ${profileUrl}`);
  console.log(`Speedscope: ${createSpeedscopeUrl(profileUrl, title)}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(signal === "SIGINT" ? 130 : 143));
  });
}

function parseIntOption(value, fallback, name) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${name} to be a positive integer, got: ${value}`);
  }

  return parsed;
}

function sanitizeRoute(value) {
  return value.replace(/^\/+/, "") || "profile.cpuprofile";
}
