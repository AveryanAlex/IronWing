const UPSTREAM_ROUTES = [
  { prefix: "/autotest", origin: "https://autotest.ardupilot.org" },
  { prefix: "/firmware", origin: "https://firmware.ardupilot.org" },
] as const;

const READ_METHODS = new Set(["GET", "HEAD"]);
const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "range",
] as const;

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
  "access-control-expose-headers": "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
  "access-control-max-age": "86400",
} as const;

type UpstreamFetch = (input: string, init?: RequestInit) => Promise<Response>;

type CloudflareRequestInit = RequestInit & {
  cf: {
    cacheEverything: true;
    cacheTtlByStatus: Record<string, number>;
  };
};

function withCors(headers = new Headers()): Headers {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

function textResponse(body: string, status: number, requestMethod: string, extraHeaders?: HeadersInit): Response {
  const headers = withCors(new Headers(extraHeaders));
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(requestMethod === "HEAD" ? null : body, { status, headers });
}

function upstreamUrlFor(requestUrl: URL): URL | null {
  const route = UPSTREAM_ROUTES.find(
    ({ prefix }) => requestUrl.pathname === prefix || requestUrl.pathname.startsWith(`${prefix}/`),
  );
  if (!route) {
    return null;
  }

  const upstreamUrl = new URL(route.origin);
  upstreamUrl.pathname = requestUrl.pathname.slice(route.prefix.length) || "/";
  upstreamUrl.search = requestUrl.search;
  return upstreamUrl;
}

function upstreamRequestHeaders(requestHeaders: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = requestHeaders.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function proxyResponse(upstreamResponse: Response): Response {
  const headers = new Headers(upstreamResponse.headers);
  headers.delete("access-control-allow-origin");
  headers.delete("access-control-allow-methods");
  headers.delete("access-control-allow-headers");
  headers.delete("access-control-expose-headers");
  headers.delete("access-control-max-age");
  headers.delete("set-cookie");
  withCors(headers);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export async function handleAssetsProxyRequest(
  request: Request,
  upstreamFetch: UpstreamFetch = globalThis.fetch,
): Promise<Response> {
  const upstreamUrl = upstreamUrlFor(new URL(request.url));
  if (upstreamUrl === null) {
    return textResponse("Not found", 404, request.method);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }

  if (!READ_METHODS.has(request.method)) {
    return textResponse("Method not allowed", 405, request.method, {
      allow: "GET, HEAD, OPTIONS",
    });
  }

  const init: CloudflareRequestInit = {
    method: request.method,
    headers: upstreamRequestHeaders(request.headers),
    redirect: "follow",
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: {
        "200-299": 3600,
        "404": 60,
        "500-599": 0,
      },
    },
  };

  try {
    return proxyResponse(await upstreamFetch(upstreamUrl.toString(), init));
  } catch {
    return textResponse("Upstream request failed", 502, request.method);
  }
}

export default {
  fetch(request: Request): Promise<Response> {
    return handleAssetsProxyRequest(request);
  },
};
