#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const DEFAULT_ROOT = "dist/web";

const MIME_TYPES = new Map([
  [".avif", "image/avif"],
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function parseArgs(args) {
  const config = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    root: DEFAULT_ROOT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--host") {
      config.host = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--port") {
      config.port = parsePort(readOptionValue(args, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--root") {
      config.root = readOptionValue(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unsupported argument "${arg}". Expected --host, --port, or --root.`);
  }

  return config;
}

function readOptionValue(args, index, option) {
  const value = args[index + 1];
  if (value == null || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }

  return value;
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid --port "${value}". Expected an integer from 1 to 65535.`);
  }

  return port;
}

async function assertDirectory(path) {
  try {
    const stats = await stat(path);
    if (!stats.isDirectory()) {
      throw new Error(`${path} is not a directory.`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Static root ${path} does not exist. Run pnpm run build:web first.`);
    }

    throw error;
  }
}

function resolveInsideRoot(root, requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const candidate = resolve(root, decodedPath.replace(/^\/+/, ""));
  const relativePath = relative(root, candidate);

  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return candidate;
  }

  return undefined;
}

async function findStaticFile(root, requestPath, allowHtmlFallback) {
  const candidate = resolveInsideRoot(root, requestPath);
  if (candidate == null) {
    return undefined;
  }

  const candidates = [candidate];
  if (!extname(candidate)) {
    candidates.push(`${candidate}.html`);
  }

  for (const path of candidates) {
    const filePath = await resolveFileCandidate(path);
    if (filePath != null) {
      return filePath;
    }
  }

  if (allowHtmlFallback) {
    return resolveFileCandidate(join(root, "index.html"));
  }

  return undefined;
}

async function resolveFileCandidate(path) {
  try {
    const stats = await stat(path);
    if (stats.isFile()) {
      return { path, stats };
    }

    if (stats.isDirectory()) {
      const indexPath = join(path, "index.html");
      const indexStats = await stat(indexPath);
      if (indexStats.isFile()) {
        return { path: indexPath, stats: indexStats };
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
      throw error;
    }
  }

  return undefined;
}

function wantsHtml(request) {
  const accept = request.headers.accept ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

function sendPlain(response, status, message) {
  response.writeHead(status, {
    "content-length": Buffer.byteLength(message),
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

function sendFile(request, response, file) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-length": file.stats.size,
    "content-type": MIME_TYPES.get(extname(file.path)) ?? "application/octet-stream",
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(file.path).pipe(response);
}

function requestPath(request) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  return url.pathname;
}

const config = parseArgs(process.argv.slice(2));
const root = resolve(process.cwd(), config.root);

await assertDirectory(root);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendPlain(response, 405, "Method not allowed");
    return;
  }

  try {
    const file = await findStaticFile(root, requestPath(request), wantsHtml(request));
    if (file == null) {
      sendPlain(response, 404, "Not found");
      return;
    }

    sendFile(request, response, file);
  } catch (error) {
    console.error(error);
    sendPlain(response, 500, "Internal server error");
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[e2e-serve] Serving ${root} at http://${config.host}:${config.port}`);
});
