import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, readStorageRawMock, writeStorageRawMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  readStorageRawMock: vi.fn(),
  writeStorageRawMock: vi.fn(),
}));

vi.mock("@platform/http", () => ({ fetch: fetchMock }));
vi.mock("./local-storage", () => ({
  readStorageRaw: readStorageRawMock,
  writeStorageRaw: writeStorageRawMock,
}));

import { fetchParamMetadataXml } from "./param-metadata-cache";

const RAW_URL = "https://raw.githubusercontent.com/ArduPilot/ParameterRepository/main";
const INDEX_URL = "https://api.github.com/repos/ArduPilot/ParameterRepository/git/trees/main";
const INDEX_KEY = "param_meta_github_folders";
const folders = ["Copter-4.8", "Plane-4.8", "Rover-4.8", "Sub-4.8", "Tracker-4.8", "AP_Periph-4.8", "Blimp-4.8"];
let storage: Map<string, string>;

function response(text: string): Response {
  return { ok: true, text: vi.fn().mockResolvedValue(text) } as unknown as Response;
}

function indexResponse(paths = folders): Response {
  return response(JSON.stringify({ tree: paths.map((path) => ({ type: "tree", path })), truncated: false }));
}

function cache(key: string, value: string, timestamp = "9000"): void {
  storage.set(key, value);
  storage.set(`${key}_ts`, timestamp);
}

function mergedXml(...parts: string[]): string {
  return `<paramfile>\n${parts.join("\n")}\n</paramfile>`;
}

describe("fetchParamMetadataXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    storage = new Map();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url === INDEX_URL ? indexResponse() : response(`<xml>${url.slice(RAW_URL.length + 1).split("/")[0]}</xml>`),
    );
    readStorageRawMock.mockReset();
    readStorageRawMock.mockImplementation((key: string) => storage.get(key) ?? null);
    writeStorageRawMock.mockReset();
    writeStorageRawMock.mockImplementation((key: string, value: string) => storage.set(key, value));
  });

  it("loads Plane 4.8.0 directly from the matching GitHub series and supplements AP_Periph", async () => {
    await expect(fetchParamMetadataXml("ArduPlane", " 4.8.0 ")).resolves.toBe(
      mergedXml("<xml>Plane-4.8</xml>", "<xml>AP_Periph-4.8</xml>"),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `${RAW_URL}/Plane-4.8/apm.pdef.xml`, INDEX_URL, `${RAW_URL}/AP_Periph-4.8/apm.pdef.xml`,
    ]);
    expect(storage.get("param_meta_github_Plane-4.8")).toBe("<xml>Plane-4.8</xml>");
    expect(storage.get("param_meta_github_Plane-4.8_ts")).toBe("10000");
  });

  it("shares cached XML between firmware patches in the same series", async () => {
    await fetchParamMetadataXml("ArduCopter", "4.8.0");
    fetchMock.mockClear();
    writeStorageRawMock.mockClear();

    await expect(fetchParamMetadataXml("ArduCopter", "4.8.1")).resolves.toBe(
      mergedXml("<xml>Copter-4.8</xml>", "<xml>AP_Periph-4.8</xml>"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it("puts the requested series before the latest generic definitions", async () => {
    await expect(fetchParamMetadataXml("ArduCopter", "4.5.7")).resolves.toBe(
      mergedXml("<xml>Copter-4.5</xml>", "<xml>Copter-4.8</xml>", "<xml>AP_Periph-4.8</xml>"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${RAW_URL}/Copter-4.5/apm.pdef.xml`);
  });

  it("merges XML documents with the declaration and generated comment used by GitHub metadata", async () => {
    const definition = '<vehicles><parameters name="ArduPlane"><param name="ArduPlane:TEST" /></parameters></vehicles>';
    fetchMock.mockImplementation(async (url: string) => url === INDEX_URL ? indexResponse() : response(
      `<?xml version="1.0" encoding="utf-8"?>\n<!-- Dynamically generated parameters -->\n<paramfile>\n${definition}\n</paramfile>`,
    ));
    await expect(fetchParamMetadataXml("ArduPlane", "4.8.0")).resolves.toBe(mergedXml(definition, definition));
  });

  it("discovers the latest generic series numerically instead of hardcoding a version", async () => {
    fetchMock.mockResolvedValueOnce(indexResponse(["Plane-4.9", "Plane-4.10", "Plane-3.99", "AP_Periph-4.8"]));

    await expect(fetchParamMetadataXml("ArduPlane")).resolves.toBe(
      mergedXml("<xml>Plane-4.10</xml>", "<xml>AP_Periph-4.8</xml>"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${RAW_URL}/Plane-4.10/apm.pdef.xml`);
  });

  it.each([
    ["ArduCopter", "Copter"], ["Heli", "Copter"], ["SITL", "Copter"],
    ["ArduPlane", "Plane"], ["Rover", "Rover"], ["ArduSub", "Sub"],
    ["AntennaTracker", "Tracker"], ["AP_Periph", "AP_Periph"], ["Blimp", "Blimp"],
  ])("loads %s generic metadata from the %s repository folders", async (slug, vehicle) => {
    await expect(fetchParamMetadataXml(slug)).resolves.toContain(`<xml>${vehicle}-4.8</xml>`);
    expect(fetchMock).toHaveBeenCalledWith(`${RAW_URL}/${vehicle}-4.8/apm.pdef.xml`);
  });

  it("fetches AP_Periph only once when it is the requested vehicle", async () => {
    await expect(fetchParamMetadataXml("AP_Periph", "4.8.0")).resolves.toBe("<xml>AP_Periph-4.8</xml>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses generic GitHub metadata when the requested series returns 404", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    await expect(fetchParamMetadataXml("ArduPlane", "4.9.0")).resolves.toBe(
      mergedXml("<xml>Plane-4.8</xml>", "<xml>AP_Periph-4.8</xml>"),
    );
    expect(fetchMock).toHaveBeenCalledWith(`${RAW_URL}/Plane-4.8/apm.pdef.xml`);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("404"));
  });

  it("uses generic GitHub metadata when the versioned request throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(fetchParamMetadataXml("ArduPlane", "4.5.7")).resolves.toContain("<xml>Plane-4.8</xml>");
  });

  it.each([undefined, null, "   ", "4.8", "4.8.0-dev", "../../evil"])(
    "skips version lookup for invalid or absent firmware version %s", async (version) => {
      await fetchParamMetadataXml("ArduPlane", version);
      expect(fetchMock).toHaveBeenNthCalledWith(1, INDEX_URL);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    },
  );

  it.each(["../../evil", "toString", "__proto__", "unknown"])("rejects unknown slug %s", async (slug) => {
    await expect(fetchParamMetadataXml(slug, "4.8.0")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes both index and XML after seven days", async () => {
    cache(INDEX_KEY, JSON.stringify(["Plane-4.7"]), "1000");
    cache("param_meta_github_Plane-4.8", "<xml>stale</xml>", "1000");
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);

    await expect(fetchParamMetadataXml("ArduPlane")).resolves.toContain("<xml>Plane-4.8</xml>");
    expect(fetchMock).toHaveBeenCalledWith(INDEX_URL);
    expect(storage.get("param_meta_github_Plane-4.8_ts")).toBe("604801000");
  });

  it("uses stale cached index and XML when offline", async () => {
    cache(INDEX_KEY, JSON.stringify(["Plane-4.8", "AP_Periph-4.8"]), "1000");
    cache("param_meta_github_Plane-4.8", "<xml>cached plane</xml>", "1000");
    cache("param_meta_github_AP_Periph-4.8", "<xml>cached periph</xml>", "1000");
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(fetchParamMetadataXml("ArduPlane")).resolves.toBe(
      mergedXml("<xml>cached plane</xml>", "<xml>cached periph</xml>"),
    );
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it.each([
    response("not JSON"),
    response(JSON.stringify({ tree: [] })),
    response(JSON.stringify({ tree: [{ path: "Plane-4.8", type: "tree" }], truncated: true })),
    { ok: false, status: 403 } as Response,
  ])("retains a stale index when GitHub returns an invalid or unavailable index", async (invalidResponse) => {
    cache(INDEX_KEY, JSON.stringify(["Plane-4.8"]), "1000");
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);
    fetchMock.mockResolvedValueOnce(invalidResponse);
    await expect(fetchParamMetadataXml("ArduPlane")).resolves.toBe("<xml>Plane-4.8</xml>");
    expect(storage.get(`${INDEX_KEY}_ts`)).toBe("1000");
  });

  it("keeps requested metadata if the generic index is unavailable", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url === INDEX_URL ? { ok: false, status: 403 } as Response : response("<xml>requested</xml>"),
    );
    await expect(fetchParamMetadataXml("ArduPlane", "4.8.0")).resolves.toBe("<xml>requested</xml>");
  });

  it("returns null when no source or cache is available", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchParamMetadataXml("ArduPlane", "4.8.0")).resolves.toBeNull();
  });

  it("ignores unrelated repository entries", async () => {
    fetchMock.mockResolvedValueOnce(response(JSON.stringify({ tree: [
      null, { path: "README.md", type: "blob" }, { path: "../evil-4.8", type: "tree" },
      { path: "Plane-4.8", type: "blob" }, { path: "Plane-4.7", type: "tree" },
    ] })));
    await expect(fetchParamMetadataXml("ArduPlane")).resolves.toBe("<xml>Plane-4.7</xml>");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
