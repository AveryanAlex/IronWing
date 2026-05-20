import { describe, expect, it } from "vitest";

import { metadataForBrowserFile } from "./browser-files";
import { BROWSER_LOG_STORAGE_LOCATION, createBrowserPersistentStorage } from "./browser-storage";

describe("browser persistent storage", () => {
  it("returns an empty browser catalog without IndexedDB", async () => {
    const storage = createBrowserPersistentStorage({ indexedDB: null });

    await expect(storage.loadLogCatalog()).resolves.toEqual({
      schema_version: 1,
      storage: BROWSER_LOG_STORAGE_LOCATION,
      migrated_from_schema_version: null,
      entries: [],
    });
  });

  it("persists catalog, log bytes, indexes, and completed recordings in memory fallback", async () => {
    const storage = createBrowserPersistentStorage({ indexedDB: null, now: () => 1000 });
    const file = new File([new Uint8Array([1, 2, 3])], "flight.tlog", {
      type: "application/octet-stream",
      lastModified: 500,
    });
    const source = metadataForBrowserFile(file);

    await storage.saveLogCatalog({
      schema_version: 1,
      storage: BROWSER_LOG_STORAGE_LOCATION,
      migrated_from_schema_version: null,
      entries: [],
    });
    const logReference = await storage.putLogBytes({
      entry_id: "entry-1",
      format: "tlog",
      source,
      bytes: new Uint8Array([1, 2, 3]),
    });
    await storage.putLogIndex({
      index_id: "index-1",
      entry_id: "entry-1",
      reference: null,
      payload: { message_count: 0 },
    });
    const recordingReference = await storage.putCompletedRecording({
      recording_id: "recording-1",
      file_name: "recording.tlog",
      destination_path: "browser-storage://recordings/recording-1",
      bytes: new Uint8Array([4, 5]),
      started_at_unix_msec: null,
    });

    await expect(storage.loadLogCatalog()).resolves.toEqual(expect.objectContaining({ storage: BROWSER_LOG_STORAGE_LOCATION }));
    await expect(storage.getLogBytes("entry-1")).resolves.toEqual(expect.objectContaining({
      entry_id: "entry-1",
      bytes: new Uint8Array([1, 2, 3]),
      reference: logReference,
    }));
    await expect(storage.getLogIndex("index-1")).resolves.toEqual(expect.objectContaining({
      index_id: "index-1",
      payload: { message_count: 0 },
    }));
    await expect(storage.getCompletedRecording("recording-1")).resolves.toEqual(expect.objectContaining({
      recording_id: "recording-1",
      bytes: new Uint8Array([4, 5]),
      reference: recordingReference,
    }));
  });
});
