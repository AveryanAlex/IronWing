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

describe("fetchParamMetadataXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock.mockReset();
    readStorageRawMock.mockReset();
    writeStorageRawMock.mockReset();
  });

  it("returns cached metadata when cache is fresh", async () => {
    vi.spyOn(Date, "now").mockReturnValue(10_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_ArduCopter") {
        return "<xml>cached</xml>";
      }
      if (key === "param_meta_ArduCopter_ts") {
        return "9000";
      }
      return null;
    });

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe("<xml>cached</xml>");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });

  it("fetches and updates cache when cached metadata is stale", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    readStorageRawMock.mockImplementation((key: string) => {
      if (key === "param_meta_ArduCopter") {
        return "<xml>stale</xml>";
      }
      if (key === "param_meta_ArduCopter_ts") {
        return "1000";
      }
      return null;
    });

    const text = vi.fn().mockResolvedValue("<xml>fresh</xml>");
    fetchMock.mockResolvedValue({ ok: true, text } as any);

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBe("<xml>fresh</xml>");
    expect(fetchMock).toHaveBeenCalledWith("https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml");
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(1, "param_meta_ArduCopter", "<xml>fresh</xml>");
    expect(writeStorageRawMock).toHaveBeenNthCalledWith(2, "param_meta_ArduCopter_ts", "1000000000");
  });

  it("returns null when fetch throws and does not write cache", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    readStorageRawMock.mockReturnValue(null);
    fetchMock.mockRejectedValue(new Error("network down"));

    const xml = await fetchParamMetadataXml("ArduCopter");

    expect(xml).toBeNull();
    expect(warn).toHaveBeenCalled();
    expect(writeStorageRawMock).not.toHaveBeenCalled();
  });
});
