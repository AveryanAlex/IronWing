import type { LogFormat, LogIndexReference, LogLibraryCatalog, LogLibraryStorageLocation } from "../../../logs";
import type { BrowserFileMetadata } from "./browser-files";

export const BROWSER_STORAGE_DB_NAME = "ironwing-web-storage";
export const BROWSER_STORAGE_DB_VERSION = 1;
export const BROWSER_LOG_CATALOG_ID = "log-library/catalog/v1";
export const BROWSER_LOG_CATALOG_STORE = "log_catalog";
export const BROWSER_LOG_BLOBS_STORE = "log_blobs";
export const BROWSER_LOG_INDEXES_STORE = "log_indexes";
export const BROWSER_RECORDINGS_STORE = "recordings";

export const BROWSER_LOG_STORAGE_LOCATION: LogLibraryStorageLocation = {
  kind: "browser_storage",
  catalog_id: BROWSER_LOG_CATALOG_ID,
  indexes_store: BROWSER_LOG_INDEXES_STORE,
  blobs_store: BROWSER_LOG_BLOBS_STORE,
  recordings_store: BROWSER_RECORDINGS_STORE,
};

export type BrowserStoredBlobReference = {
  kind: "indexed_db" | "memory";
  db_name: string;
  store_name: string;
  key: string;
  size_bytes: number;
  content_type: string | null;
  updated_at_unix_msec: number;
};

export type BrowserStoredLogBytes = {
  entry_id: string;
  format: LogFormat | null;
  source: BrowserFileMetadata;
  bytes: Uint8Array;
  reference: BrowserStoredBlobReference;
  stored_at_unix_msec: number;
};

export type BrowserStoredLogIndex = {
  index_id: string;
  entry_id: string;
  reference: LogIndexReference | null;
  payload: unknown;
  stored_at_unix_msec: number;
};

export type BrowserCompletedRecording = {
  recording_id: string;
  file_name: string;
  destination_path: string;
  bytes: Uint8Array;
  reference: BrowserStoredBlobReference;
  started_at_unix_msec: number | null;
  completed_at_unix_msec: number;
};

export type BrowserPersistentStorage = {
  loadLogCatalog(): Promise<LogLibraryCatalog>;
  saveLogCatalog(catalog: LogLibraryCatalog): Promise<void>;
  clearLogCatalog(): Promise<void>;
  putLogBytes(input: BrowserLogBytesInput): Promise<BrowserStoredBlobReference>;
  getLogBytes(entryId: string): Promise<BrowserStoredLogBytes | null>;
  deleteLogBytes(entryId: string): Promise<void>;
  listLogBytes(): Promise<BrowserStoredLogBytes[]>;
  putLogIndex(input: BrowserLogIndexInput): Promise<void>;
  getLogIndex(indexId: string): Promise<BrowserStoredLogIndex | null>;
  deleteLogIndex(indexId: string): Promise<void>;
  putCompletedRecording(input: BrowserCompletedRecordingInput): Promise<BrowserStoredBlobReference>;
  getCompletedRecording(recordingId: string): Promise<BrowserCompletedRecording | null>;
  listCompletedRecordings(): Promise<BrowserCompletedRecording[]>;
};

export type BrowserLogBytesInput = {
  entry_id: string;
  format: LogFormat | null;
  source: BrowserFileMetadata;
  bytes: Uint8Array;
  content_type?: string | null;
};

export type BrowserLogIndexInput = {
  index_id: string;
  entry_id: string;
  reference: LogIndexReference | null;
  payload: unknown;
};

export type BrowserCompletedRecordingInput = {
  recording_id: string;
  file_name: string;
  destination_path: string;
  bytes: Uint8Array;
  started_at_unix_msec: number | null;
  completed_at_unix_msec?: number;
  content_type?: string | null;
};

export type BrowserPersistentStorageOptions = {
  indexedDB?: IDBFactory | null;
  now?: () => number;
};

type CatalogRecord = {
  id: typeof BROWSER_LOG_CATALOG_ID;
  catalog: LogLibraryCatalog;
  updated_at_unix_msec: number;
};

type StoredLogBytesRecord = Omit<BrowserStoredLogBytes, "bytes"> & {
  blob: Blob;
};

type StoredRecordingRecord = Omit<BrowserCompletedRecording, "bytes"> & {
  blob: Blob;
};

let defaultStorage: BrowserPersistentStorage | null = null;

export function getBrowserPersistentStorage(): BrowserPersistentStorage {
  defaultStorage ??= createBrowserPersistentStorage();
  return defaultStorage;
}

export function createBrowserPersistentStorage(options: BrowserPersistentStorageOptions = {}): BrowserPersistentStorage {
  const indexedDBFactory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
  const memoryStorage = new MemoryBrowserPersistentStorage(options.now);
  if (!indexedDBFactory) {
    return memoryStorage;
  }
  return new IndexedDbBrowserPersistentStorage(indexedDBFactory, memoryStorage, options.now);
}

export function createEmptyBrowserLogLibraryCatalog(): LogLibraryCatalog {
  return {
    schema_version: 1,
    storage: BROWSER_LOG_STORAGE_LOCATION,
    migrated_from_schema_version: null,
    entries: [],
  };
}

class IndexedDbBrowserPersistentStorage implements BrowserPersistentStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly indexedDBFactory: IDBFactory,
    private readonly fallback: BrowserPersistentStorage,
    private readonly now: (() => number) | undefined,
  ) {}

  async loadLogCatalog(): Promise<LogLibraryCatalog> {
    return this.withFallback(async (db) => {
      const record = await this.getValue<CatalogRecord>(db, BROWSER_LOG_CATALOG_STORE, BROWSER_LOG_CATALOG_ID);
      return record?.catalog ?? createEmptyBrowserLogLibraryCatalog();
    }, () => this.fallback.loadLogCatalog());
  }

  async saveLogCatalog(catalog: LogLibraryCatalog): Promise<void> {
    await this.withFallback(async (db) => {
      await this.putValue(db, BROWSER_LOG_CATALOG_STORE, {
        id: BROWSER_LOG_CATALOG_ID,
        catalog,
        updated_at_unix_msec: this.timestamp(),
      } satisfies CatalogRecord);
    }, () => this.fallback.saveLogCatalog(catalog));
  }

  async clearLogCatalog(): Promise<void> {
    await this.withFallback(async (db) => {
      await this.deleteValue(db, BROWSER_LOG_CATALOG_STORE, BROWSER_LOG_CATALOG_ID);
    }, () => this.fallback.clearLogCatalog());
  }

  async putLogBytes(input: BrowserLogBytesInput): Promise<BrowserStoredBlobReference> {
    return this.withFallback(async (db) => {
      const timestamp = this.timestamp();
      const reference = this.reference(BROWSER_LOG_BLOBS_STORE, input.entry_id, input.bytes, input.content_type ?? input.source.mime_type, timestamp);
      const record: StoredLogBytesRecord = {
        entry_id: input.entry_id,
        format: input.format,
        source: input.source,
        blob: bytesToBlob(input.bytes, reference.content_type),
        reference,
        stored_at_unix_msec: timestamp,
      };
      await this.putValue(db, BROWSER_LOG_BLOBS_STORE, record);
      return reference;
    }, () => this.fallback.putLogBytes(input));
  }

  async getLogBytes(entryId: string): Promise<BrowserStoredLogBytes | null> {
    return this.withFallback(async (db) => {
      const record = await this.getValue<StoredLogBytesRecord>(db, BROWSER_LOG_BLOBS_STORE, entryId);
      return record ? logBytesFromRecord(record) : null;
    }, () => this.fallback.getLogBytes(entryId));
  }

  async deleteLogBytes(entryId: string): Promise<void> {
    await this.withFallback(async (db) => {
      await this.deleteValue(db, BROWSER_LOG_BLOBS_STORE, entryId);
    }, () => this.fallback.deleteLogBytes(entryId));
  }

  async listLogBytes(): Promise<BrowserStoredLogBytes[]> {
    return this.withFallback(async (db) => {
      const records = await this.getAllValues<StoredLogBytesRecord>(db, BROWSER_LOG_BLOBS_STORE);
      return Promise.all(records.map(logBytesFromRecord));
    }, () => this.fallback.listLogBytes());
  }

  async putLogIndex(input: BrowserLogIndexInput): Promise<void> {
    await this.withFallback(async (db) => {
      await this.putValue(db, BROWSER_LOG_INDEXES_STORE, {
        ...input,
        stored_at_unix_msec: this.timestamp(),
      } satisfies BrowserStoredLogIndex);
    }, () => this.fallback.putLogIndex(input));
  }

  async getLogIndex(indexId: string): Promise<BrowserStoredLogIndex | null> {
    return this.withFallback(
      (db) => this.getValue<BrowserStoredLogIndex>(db, BROWSER_LOG_INDEXES_STORE, indexId),
      () => this.fallback.getLogIndex(indexId),
    );
  }

  async deleteLogIndex(indexId: string): Promise<void> {
    await this.withFallback(async (db) => {
      await this.deleteValue(db, BROWSER_LOG_INDEXES_STORE, indexId);
    }, () => this.fallback.deleteLogIndex(indexId));
  }

  async putCompletedRecording(input: BrowserCompletedRecordingInput): Promise<BrowserStoredBlobReference> {
    return this.withFallback(async (db) => {
      const completedAt = input.completed_at_unix_msec ?? this.timestamp();
      const reference = this.reference(BROWSER_RECORDINGS_STORE, input.recording_id, input.bytes, input.content_type ?? "application/octet-stream", completedAt);
      const record: StoredRecordingRecord = {
        recording_id: input.recording_id,
        file_name: input.file_name,
        destination_path: input.destination_path,
        blob: bytesToBlob(input.bytes, reference.content_type),
        reference,
        started_at_unix_msec: input.started_at_unix_msec,
        completed_at_unix_msec: completedAt,
      };
      await this.putValue(db, BROWSER_RECORDINGS_STORE, record);
      return reference;
    }, () => this.fallback.putCompletedRecording(input));
  }

  async getCompletedRecording(recordingId: string): Promise<BrowserCompletedRecording | null> {
    return this.withFallback(async (db) => {
      const record = await this.getValue<StoredRecordingRecord>(db, BROWSER_RECORDINGS_STORE, recordingId);
      return record ? recordingFromRecord(record) : null;
    }, () => this.fallback.getCompletedRecording(recordingId));
  }

  async listCompletedRecordings(): Promise<BrowserCompletedRecording[]> {
    return this.withFallback(async (db) => {
      const records = await this.getAllValues<StoredRecordingRecord>(db, BROWSER_RECORDINGS_STORE);
      return Promise.all(records.map(recordingFromRecord));
    }, () => this.fallback.listCompletedRecordings());
  }

  private async withFallback<T>(operation: (db: IDBDatabase) => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await operation(await this.openDb());
    } catch {
      return fallback();
    }
  }

  private openDb(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const request = this.indexedDBFactory.open(BROWSER_STORAGE_DB_NAME, BROWSER_STORAGE_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        createObjectStore(db, BROWSER_LOG_CATALOG_STORE, { keyPath: "id" });
        createObjectStore(db, BROWSER_LOG_BLOBS_STORE, { keyPath: "entry_id" });
        createObjectStore(db, BROWSER_LOG_INDEXES_STORE, { keyPath: "index_id" });
        createObjectStore(db, BROWSER_RECORDINGS_STORE, { keyPath: "recording_id" });
      };
      request.onerror = () => reject(request.error ?? new Error("failed to open browser storage"));
      request.onsuccess = () => resolve(request.result);
    });
    return this.dbPromise;
  }

  private async getValue<T>(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<T | null> {
    const transaction = db.transaction(storeName, "readonly");
    const value = await requestToPromise<T | undefined>(transaction.objectStore(storeName).get(key));
    return value ?? null;
  }

  private async getAllValues<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
    const transaction = db.transaction(storeName, "readonly");
    return requestToPromise<T[]>(transaction.objectStore(storeName).getAll());
  }

  private async putValue(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
  }

  private async deleteValue(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<void> {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await transactionDone(transaction);
  }

  private reference(
    storeName: string,
    key: string,
    bytes: Uint8Array,
    contentType: string | null,
    timestamp: number,
  ): BrowserStoredBlobReference {
    return {
      kind: "indexed_db",
      db_name: BROWSER_STORAGE_DB_NAME,
      store_name: storeName,
      key,
      size_bytes: bytes.byteLength,
      content_type: contentType,
      updated_at_unix_msec: timestamp,
    };
  }

  private timestamp(): number {
    return Math.trunc(this.now?.() ?? Date.now());
  }
}

class MemoryBrowserPersistentStorage implements BrowserPersistentStorage {
  private catalog: LogLibraryCatalog | null = null;
  private readonly logBytes = new Map<string, BrowserStoredLogBytes>();
  private readonly logIndexes = new Map<string, BrowserStoredLogIndex>();
  private readonly recordings = new Map<string, BrowserCompletedRecording>();

  constructor(private readonly now: (() => number) | undefined) {}

  async loadLogCatalog(): Promise<LogLibraryCatalog> {
    return this.catalog ?? createEmptyBrowserLogLibraryCatalog();
  }

  async saveLogCatalog(catalog: LogLibraryCatalog): Promise<void> {
    this.catalog = catalog;
  }

  async clearLogCatalog(): Promise<void> {
    this.catalog = null;
  }

  async putLogBytes(input: BrowserLogBytesInput): Promise<BrowserStoredBlobReference> {
    const timestamp = this.timestamp();
    const reference = this.reference(BROWSER_LOG_BLOBS_STORE, input.entry_id, input.bytes, input.content_type ?? input.source.mime_type, timestamp);
    this.logBytes.set(input.entry_id, {
      entry_id: input.entry_id,
      format: input.format,
      source: input.source,
      bytes: copyBytes(input.bytes),
      reference,
      stored_at_unix_msec: timestamp,
    });
    return reference;
  }

  async getLogBytes(entryId: string): Promise<BrowserStoredLogBytes | null> {
    const record = this.logBytes.get(entryId);
    return record ? { ...record, bytes: copyBytes(record.bytes) } : null;
  }

  async deleteLogBytes(entryId: string): Promise<void> {
    this.logBytes.delete(entryId);
  }

  async listLogBytes(): Promise<BrowserStoredLogBytes[]> {
    return Array.from(this.logBytes.values(), (record) => ({ ...record, bytes: copyBytes(record.bytes) }));
  }

  async putLogIndex(input: BrowserLogIndexInput): Promise<void> {
    this.logIndexes.set(input.index_id, {
      ...input,
      stored_at_unix_msec: this.timestamp(),
    });
  }

  async getLogIndex(indexId: string): Promise<BrowserStoredLogIndex | null> {
    return this.logIndexes.get(indexId) ?? null;
  }

  async deleteLogIndex(indexId: string): Promise<void> {
    this.logIndexes.delete(indexId);
  }

  async putCompletedRecording(input: BrowserCompletedRecordingInput): Promise<BrowserStoredBlobReference> {
    const completedAt = input.completed_at_unix_msec ?? this.timestamp();
    const reference = this.reference(BROWSER_RECORDINGS_STORE, input.recording_id, input.bytes, input.content_type ?? "application/octet-stream", completedAt);
    this.recordings.set(input.recording_id, {
      recording_id: input.recording_id,
      file_name: input.file_name,
      destination_path: input.destination_path,
      bytes: copyBytes(input.bytes),
      reference,
      started_at_unix_msec: input.started_at_unix_msec,
      completed_at_unix_msec: completedAt,
    });
    return reference;
  }

  async getCompletedRecording(recordingId: string): Promise<BrowserCompletedRecording | null> {
    const record = this.recordings.get(recordingId);
    return record ? { ...record, bytes: copyBytes(record.bytes) } : null;
  }

  async listCompletedRecordings(): Promise<BrowserCompletedRecording[]> {
    return Array.from(this.recordings.values(), (record) => ({ ...record, bytes: copyBytes(record.bytes) }));
  }

  private reference(
    storeName: string,
    key: string,
    bytes: Uint8Array,
    contentType: string | null,
    timestamp: number,
  ): BrowserStoredBlobReference {
    return {
      kind: "memory",
      db_name: BROWSER_STORAGE_DB_NAME,
      store_name: storeName,
      key,
      size_bytes: bytes.byteLength,
      content_type: contentType,
      updated_at_unix_msec: timestamp,
    };
  }

  private timestamp(): number {
    return Math.trunc(this.now?.() ?? Date.now());
  }
}

function createObjectStore(db: IDBDatabase, name: string, options: IDBObjectStoreParameters): void {
  if (!db.objectStoreNames.contains(name)) {
    db.createObjectStore(name, options);
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("browser storage request failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("browser storage transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("browser storage transaction aborted"));
  });
}

async function logBytesFromRecord(record: StoredLogBytesRecord): Promise<BrowserStoredLogBytes> {
  const { blob, ...metadata } = record;
  return {
    ...metadata,
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

async function recordingFromRecord(record: StoredRecordingRecord): Promise<BrowserCompletedRecording> {
  const { blob, ...metadata } = record;
  return {
    ...metadata,
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

function bytesToBlob(bytes: Uint8Array, contentType: string | null): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: contentType ?? "application/octet-stream" });
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}
