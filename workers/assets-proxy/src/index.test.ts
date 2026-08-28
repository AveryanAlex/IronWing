import { describe, expect, it, vi } from "vitest";

import { handleAssetsProxyRequest } from "./index";

describe("assets proxy Worker", () => {
  it.each([
    [
      "https://assets.ironwing.dev/autotest/Parameters/ArduCopter/apm.pdef.xml.gz?version=1",
      "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml.gz?version=1",
    ],
    [
      "https://assets.ironwing.dev/firmware/Copter/stable/CubeOrange/arducopter.apj",
      "https://firmware.ardupilot.org/Copter/stable/CubeOrange/arducopter.apj",
    ],
  ])("routes %s to its fixed upstream", async (requestUrl, expectedUpstreamUrl) => {
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response("asset", {
        status: 200,
        headers: {
          "access-control-allow-origin": "https://upstream.example",
          etag: '"asset-etag"',
          "set-cookie": "upstream=value",
        },
      }),
    );

    const response = await handleAssetsProxyRequest(
      new Request(requestUrl, {
        headers: {
          authorization: "Bearer private",
          cookie: "session=private",
          origin: "https://app.ironwing.dev",
          range: "bytes=0-99",
        },
      }),
      upstreamFetch,
    );

    expect(upstreamFetch).toHaveBeenCalledOnce();
    const [upstreamUrl, init] = upstreamFetch.mock.calls[0] as unknown as [string, RequestInit & { cf: unknown }];
    const forwardedHeaders = new Headers(init.headers);
    expect(upstreamUrl).toBe(expectedUpstreamUrl);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("follow");
    expect(init.cf).toBeDefined();
    expect(forwardedHeaders.get("range")).toBe("bytes=0-99");
    expect(forwardedHeaders.has("authorization")).toBe(false);
    expect(forwardedHeaders.has("cookie")).toBe(false);
    expect(forwardedHeaders.has("origin")).toBe(false);

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("asset");
    expect(response.headers.get("etag")).toBe('"asset-etag"');
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, HEAD, OPTIONS");
  });

  it("answers recognized CORS preflights without contacting an upstream", async () => {
    const upstreamFetch = vi.fn();

    const response = await handleAssetsProxyRequest(
      new Request("https://assets.ironwing.dev/firmware/manifest.json.gz", {
        method: "OPTIONS",
        headers: { "access-control-request-headers": "range" },
      }),
      upstreamFetch,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-max-age")).toBe("86400");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects unknown routes and write methods", async () => {
    const upstreamFetch = vi.fn();

    const missing = await handleAssetsProxyRequest(
      new Request("https://assets.ironwing.dev/other/asset"),
      upstreamFetch,
    );
    const write = await handleAssetsProxyRequest(
      new Request("https://assets.ironwing.dev/firmware/manifest.json.gz", { method: "POST" }),
      upstreamFetch,
    );

    expect(missing.status).toBe(404);
    expect(write.status).toBe(405);
    expect(write.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(missing.headers.get("access-control-allow-origin")).toBe("*");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("does not allow a proxy path to replace the fixed upstream origin", async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

    await handleAssetsProxyRequest(
      new Request("https://assets.ironwing.dev/autotest//example.com/private"),
      upstreamFetch,
    );

    expect(upstreamFetch).toHaveBeenCalledWith(
      "https://autotest.ardupilot.org//example.com/private",
      expect.any(Object),
    );
  });

  it("returns a CORS-readable gateway error when the upstream fetch fails", async () => {
    const response = await handleAssetsProxyRequest(
      new Request("https://assets.ironwing.dev/autotest/Parameters/SITL/apm.pdef.xml.gz"),
      vi.fn().mockRejectedValue(new Error("network unavailable")),
    );

    expect(response.status).toBe(502);
    await expect(response.text()).resolves.toBe("Upstream request failed");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
