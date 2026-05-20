import { describe, expect, it, vi } from "vitest";

import { browserFileId, metadataForBrowserFile, openBrowserBinaryFile, saveBrowserText } from "./browser-files";

describe("browser file helpers", () => {
  it("builds stable metadata for selected files", () => {
    const file = new File(["abc"], "Flight.TLOG", { type: "application/octet-stream", lastModified: 1234 });

    expect(browserFileId(file)).toBe("flight.tlog-3-1234");
    expect(metadataForBrowserFile(file)).toEqual({
      id: "flight.tlog-3-1234",
      name: "Flight.TLOG",
      size_bytes: 3,
      modified_unix_msec: 1234,
      mime_type: "application/octet-stream",
      pseudo_path: "browser-file://flight.tlog-3-1234/Flight.TLOG",
    });
  });

  it("opens binary files through an injectable picker", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "flight.bin", { lastModified: 99 });

    const selection = await openBrowserBinaryFile({}, {
      openFilePicker: async () => ({ file }),
    });

    expect(selection?.metadata.name).toBe("flight.bin");
    expect(Array.from(selection?.contents ?? [])).toEqual([1, 2, 3]);
  });

  it("saves via an injectable writer before falling back to downloads", async () => {
    const write = vi.fn(async () => undefined);

    const result = await saveBrowserText("hello", { suggested_name: "notes.txt", mime_type: "text/plain" }, {
      now: () => 42,
      saveFilePicker: async () => ({ name: "notes.txt", write }),
    });

    expect(result.kind).toBe("file_system_access");
    expect(result.metadata).toEqual(expect.objectContaining({
      name: "notes.txt",
      size_bytes: 5,
      modified_unix_msec: 42,
    }));
    expect(write).toHaveBeenCalledWith(expect.any(Blob));
  });
});
