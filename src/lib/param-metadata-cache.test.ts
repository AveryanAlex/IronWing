import { gzipSync, strToU8 } from "fflate";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock, readStorageRawMock, writeStorageRawMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  readStorageRawMock: vi.fn(),
  writeStorageRawMock: vi.fn(),
}));

vi.mock("@platform/http", () => ({
  fetch: fetchMock,
}));

vi.mock("./local-storage", () => ({
  readStorageRaw: readStorageRawMock,
  writeStorageRaw: writeStorageRawMock,
}));

import { fetchParamMetadataXml } from "./param-metadata-cache";

function compressedResponse(xml: string): Response {
  const bytes = gzipSync(strToU8(xml));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(buffer),
  } as unknown as Response;
}

function plainResponse(xml: string): Response {
  return {
    ok: true,
    text: vi.fn().mockResolvedValue(xml),
  } as unknown as Response;
}

function failedResponse(status: number): Response {
  return { ok: false, status } as Response;
}

function mergedXml(...parts: string[]): string {
  return `<paramfile>\n${parts.join("\n")}\n</paramfile>`;
}

describe("fetchParamMetadataXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    readStorageRawMock.mockReset();
    readStorageRawMock.mockReturnValue(null);
    writeStorageRawMock.mockReset();
  });

  it("returns cached generic metadata when its decompressed XML cache is fresh", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (["param_meta_ArduCopter", "param_meta_SITL", "param_meta_AP_Periph"].includes(key)) {
        return `<xml>${key}</xml>`;
      }
      if (["param_meta_ArduCopter_ts", "param_meta_SITL_ts", "param_meta_AP_Periph_ts"].includes(key)) {
        return "9000";
      }
      return null;
    });

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe(mergedXml("<xml>param_meta_ArduCopter</xml>", "<xml>param_meta_SITL</xml>", "<xml>param_meta_AP_Periph</xml>"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it("fetches compressed generic metadata, decompresses it, and caches XML for seven days", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    fetchMock.mockResolvedValue(compressedResponse("<xml>fresh</xml>"));

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe(mergedXml("<xml>fresh</xml>", "<xml>fresh</xml>", "<xml>fresh</xml>"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml.gz",
    );
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(1, "param_meta_ArduCopter", "<xml>fresh</xml>");
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(2, "param_meta_ArduCopter_ts", "1000000000");
  });

  it("refreshes generic metadata once the seven-day cache lifetime is reached", async () => {
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_ArduCopter") return "<xml>stale</xml>";
      if (key === "param_meta_ArduCopter_ts") return "1000";
      return null;
    });
    fetchMock.mockResolvedValue(compressedResponse("<xml>fresh</xml>"));

    await expect(fetchParamMetadataXml("ArduCopter")).resolves.toBe(mergedXml("<xml>fresh</xml>", "<xml>fresh</xml>", "<xml>fresh</xml>"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falls back to stale cached XML when the generic request fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_ArduCopter") return "<xml>stale</xml>";
      if (key === "param_meta_ArduCopter_ts") return "1000";
      return null;
    });
    fetchMock.mockRejectedValue(new Error("network down"));

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe("<xml>stale</xml>");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it("falls back to stale cached XML when generic decompression fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(604_801_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_ArduCopter") return "<xml>stale</xml>";
      if (key === "param_meta_ArduCopter_ts") return "1000";
      return null;
    });
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as Response);

    await expect(fetchParamMetadataXml("ArduCopter")).resolves.toBe("<xml>stale</xml>");
    expect(warn).toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it("falls back from an unavailable requested generic source to SITL", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(failedResponse(404))
      .mockResolvedValueOnce(compressedResponse("<xml>sitl</xml>"));

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe("<xml>sitl</xml>");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml.gz",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://autotest.ardupilot.org/Parameters/SITL/apm.pdef.xml.gz",
    );
    expect(warn).toHaveBeenCalled();
  });

  it("falls back from unavailable requested and SITL definitions to AP_Periph", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(failedResponse(404))
      .mockResolvedValueOnce(failedResponse(404))
      .mockResolvedValueOnce(compressedResponse("<xml>periph</xml>"));

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe("<xml>periph</xml>");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://autotest.ardupilot.org/Parameters/AP_Periph/apm.pdef.xml.gz",
    );
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("merges a separately cached versioned XML definition before generic metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_versioned_Copter_4.5.7") return "<xml>versioned cached</xml>";
      if (key === "param_meta_versioned_Copter_4.5.7_ts") return "9000";
      if (["param_meta_ArduCopter", "param_meta_SITL", "param_meta_AP_Periph"].includes(key)) return `<xml>${key}</xml>`;
      if (["param_meta_ArduCopter_ts", "param_meta_SITL_ts", "param_meta_AP_Periph_ts"].includes(key)) return "9000";
      return null;
    });

    const xml = await fetchParamMetadataXml("ArduCopter", "4.5.7");

    expect(xml).toBe(mergedXml("<xml>versioned cached</xml>", "<xml>param_meta_ArduCopter</xml>", "<xml>param_meta_SITL</xml>", "<xml>param_meta_AP_Periph</xml>"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches and separately caches plain versioned XML before trying generic metadata", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    fetchMock
      .mockResolvedValueOnce(plainResponse("<xml>versioned fresh</xml>"))
      .mockResolvedValue(compressedResponse("<xml>generic fresh</xml>"));

    const xml = await fetchParamMetadataXml("ArduCopter", " 4.5.7 ");

    expect(xml).toBe(mergedXml("<xml>versioned fresh</xml>", "<xml>generic fresh</xml>", "<xml>generic fresh</xml>", "<xml>generic fresh</xml>"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://autotest.ardupilot.org/Parameters/versioned/Copter/stable-4.5.7/apm.pdef.xml",
    );
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(
      1,
      "param_meta_versioned_Copter_4.5.7",
      "<xml>versioned fresh</xml>",
    );
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(2, "param_meta_versioned_Copter_4.5.7_ts", "10000");
  });

  it.each([
    ["ArduCopter", "Copter"],
    ["ArduPlane", "Plane"],
    ["Rover", "Rover"],
    ["ArduSub", "Sub"],
    ["AntennaTracker", "Tracker"],
  ])("maps versioned %s metadata to its %s short URL segment", async (slug, short) => {
    fetchMock.mockImplementation((url: string) => Promise.resolve(
      url.includes("/versioned/") ? plainResponse("<xml>versioned</xml>") : compressedResponse("<xml>generic</xml>"),
    ));

    await expect(fetchParamMetadataXml(slug, "1.2.3")).resolves.toContain("<xml>versioned</xml>");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://autotest.ardupilot.org/Parameters/versioned/${short}/stable-1.2.3/apm.pdef.xml`,
    );
  });

  it("rejects unknown generic slugs before URL construction", async () => {
    await expect(fetchParamMetadataXml("../../evil")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries generic metadata when versioned XML is unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(failedResponse(404))
      .mockResolvedValueOnce(compressedResponse("<xml>generic</xml>"));

    const xml = await fetchParamMetadataXml("ArduCopter", "4.5.7");

    expect(xml).toBe("<xml>generic</xml>");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://autotest.ardupilot.org/Parameters/versioned/Copter/stable-4.5.7/apm.pdef.xml",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml.gz",
    );
    expect(warn).toHaveBeenCalled();
  });

  it("skips versioned lookup for blank versions and slugs without version support", async () => {
    fetchMock
      .mockResolvedValueOnce(compressedResponse("<xml>blank generic</xml>"))
      .mockResolvedValueOnce(compressedResponse("<xml>blank sitl</xml>"))
      .mockResolvedValueOnce(compressedResponse("<xml>blank periph</xml>"))
      .mockResolvedValueOnce(compressedResponse("<xml>blimp generic</xml>"))
      .mockResolvedValueOnce(compressedResponse("<xml>blimp sitl</xml>"))
      .mockResolvedValueOnce(compressedResponse("<xml>blimp periph</xml>"));

    await expect(fetchParamMetadataXml("ArduCopter", "   ")).resolves.toBe(mergedXml("<xml>blank generic</xml>", "<xml>blank sitl</xml>", "<xml>blank periph</xml>"));
    await expect(fetchParamMetadataXml("Blimp", "1.2.3")).resolves.toBe(mergedXml("<xml>blimp generic</xml>", "<xml>blimp sitl</xml>", "<xml>blimp periph</xml>"));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml.gz",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://autotest.ardupilot.org/Parameters/Blimp/apm.pdef.xml.gz",
    );
  });
});
