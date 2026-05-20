export type BrowserFileMetadata = {
  id: string;
  name: string;
  size_bytes: number;
  modified_unix_msec: number;
  mime_type: string | null;
  pseudo_path: string;
};

export type BrowserFileSelection<T extends string | Uint8Array> = {
  metadata: BrowserFileMetadata;
  contents: T;
  file: File;
  handle: BrowserFileSystemFileHandle | null;
};

export type BrowserFileAccept = {
  description?: string;
  mime_types?: string[];
  extensions?: string[];
};

export type BrowserOpenFileOptions = {
  accepts?: BrowserFileAccept[];
  multiple?: false;
};

export type BrowserSaveFileOptions = {
  suggested_name: string;
  mime_type?: string;
  accepts?: BrowserFileAccept[];
};

export type BrowserSaveResult = {
  kind: "file_system_access" | "download";
  metadata: BrowserFileMetadata;
};

export type BrowserFileEnvironment = {
  window?: Window;
  document?: Document;
  url?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  now?: () => number;
  openFilePicker?: (options: BrowserOpenFileOptions) => Promise<BrowserPickedFile | null>;
  saveFilePicker?: (options: BrowserSaveFileOptions) => Promise<BrowserWritableFile | null>;
  download?: (blob: Blob, suggestedName: string) => void;
};

export type BrowserPickedFile = {
  file: File;
  handle?: BrowserFileSystemFileHandle | null;
};

export type BrowserWritableFile = {
  name: string;
  handle?: BrowserFileSystemFileHandle | null;
  write: (blob: Blob) => Promise<void>;
};

export type BrowserFileSystemFileHandle = {
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<BrowserFileSystemWritable>;
};

export type BrowserFileSystemWritable = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};

type BrowserFilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type BrowserShowOpenFilePickerOptions = {
  multiple?: boolean;
  types?: BrowserFilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
};

type BrowserShowSaveFilePickerOptions = {
  suggestedName?: string;
  types?: BrowserFilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
};

type FileSystemAccessWindow = Window & {
  showOpenFilePicker?: (options?: BrowserShowOpenFilePickerOptions) => Promise<BrowserFileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: BrowserShowSaveFilePickerOptions) => Promise<BrowserFileSystemFileHandle>;
};

export async function openBrowserBinaryFile(
  options: BrowserOpenFileOptions = {},
  environment: BrowserFileEnvironment = {},
): Promise<BrowserFileSelection<Uint8Array> | null> {
  const picked = await pickBrowserFile(options, environment);
  if (!picked) {
    return null;
  }
  return {
    metadata: metadataForBrowserFile(picked.file),
    contents: new Uint8Array(await picked.file.arrayBuffer()),
    file: picked.file,
    handle: picked.handle ?? null,
  };
}

export async function openBrowserTextFile(
  options: BrowserOpenFileOptions = {},
  environment: BrowserFileEnvironment = {},
): Promise<BrowserFileSelection<string> | null> {
  const picked = await pickBrowserFile(options, environment);
  if (!picked) {
    return null;
  }
  return {
    metadata: metadataForBrowserFile(picked.file),
    contents: await picked.file.text(),
    file: picked.file,
    handle: picked.handle ?? null,
  };
}

export async function saveBrowserBytes(
  bytes: Uint8Array,
  options: BrowserSaveFileOptions,
  environment: BrowserFileEnvironment = {},
): Promise<BrowserSaveResult> {
  return saveBrowserBlob(bytesToBlob(bytes, options.mime_type), options, environment);
}

export async function saveBrowserText(
  text: string,
  options: BrowserSaveFileOptions,
  environment: BrowserFileEnvironment = {},
): Promise<BrowserSaveResult> {
  return saveBrowserBlob(new Blob([text], { type: options.mime_type ?? "text/plain" }), options, environment);
}

export function metadataForBrowserFile(file: Pick<File, "name" | "size" | "lastModified" | "type">): BrowserFileMetadata {
  const id = browserFileId(file);
  return {
    id,
    name: file.name,
    size_bytes: file.size,
    modified_unix_msec: file.lastModified,
    mime_type: file.type || null,
    pseudo_path: `browser-file://${id}/${encodeURIComponent(file.name)}`,
  };
}

export function browserFileId(file: Pick<File, "name" | "size" | "lastModified">): string {
  const normalizedName = file.name.trim().toLowerCase() || "unnamed";
  return `${encodeURIComponent(normalizedName)}-${file.size}-${file.lastModified}`;
}

async function pickBrowserFile(
  options: BrowserOpenFileOptions,
  environment: BrowserFileEnvironment,
): Promise<BrowserPickedFile | null> {
  if (environment.openFilePicker) {
    return environment.openFilePicker(options);
  }

  const windowRef = environment.window ?? globalThis.window;
  const accessWindow = windowRef as FileSystemAccessWindow | undefined;
  if (accessWindow?.showOpenFilePicker) {
    const handles = await accessWindow.showOpenFilePicker({
      multiple: false,
      types: toFilePickerAcceptTypes(options.accepts),
      excludeAcceptAllOption: false,
    });
    const handle = handles[0];
    if (!handle) {
      return null;
    }
    return { file: await handle.getFile(), handle };
  }

  return pickFileWithInput(options, environment);
}

async function saveBrowserBlob(
  blob: Blob,
  options: BrowserSaveFileOptions,
  environment: BrowserFileEnvironment,
): Promise<BrowserSaveResult> {
  if (environment.saveFilePicker) {
    const writable = await environment.saveFilePicker(options);
    if (writable) {
      await writable.write(blob);
      return {
        kind: "file_system_access",
        metadata: metadataForSavedFile(writable.name, blob, environment.now, "browser-file-system"),
      };
    }
  }

  const windowRef = environment.window ?? globalThis.window;
  const accessWindow = windowRef as FileSystemAccessWindow | undefined;
  if (accessWindow?.showSaveFilePicker) {
    const handle = await accessWindow.showSaveFilePicker({
      suggestedName: options.suggested_name,
      types: toFilePickerAcceptTypes(options.accepts),
      excludeAcceptAllOption: false,
    });
    const writable = await handle.createWritable?.();
    if (writable) {
      await writable.write(blob);
      await writable.close();
      return {
        kind: "file_system_access",
        metadata: metadataForSavedFile(handle.name, blob, environment.now, "browser-file-system"),
      };
    }
  }

  const download = environment.download ?? ((fallbackBlob, suggestedName) => downloadBlob(fallbackBlob, suggestedName, environment));
  download(blob, options.suggested_name);
  return {
    kind: "download",
    metadata: metadataForSavedFile(options.suggested_name, blob, environment.now, "browser-download"),
  };
}

function metadataForSavedFile(
  name: string,
  blob: Blob,
  now: BrowserFileEnvironment["now"],
  pseudoPathScheme: "browser-file-system" | "browser-download",
): BrowserFileMetadata {
  const timestamp = Math.trunc(now?.() ?? Date.now());
  return {
    id: `${encodeURIComponent(name.toLowerCase() || "download")}-${blob.size}-${timestamp}`,
    name,
    size_bytes: blob.size,
    modified_unix_msec: timestamp,
    mime_type: blob.type || null,
    pseudo_path: `${pseudoPathScheme}://${encodeURIComponent(name)}`,
  };
}

function pickFileWithInput(
  options: BrowserOpenFileOptions,
  environment: BrowserFileEnvironment,
): Promise<BrowserPickedFile | null> {
  const documentRef = environment.document ?? globalThis.document;
  if (!documentRef) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const input = documentRef.createElement("input");
    input.type = "file";
    input.multiple = false;
    input.accept = toInputAccept(options.accepts);
    input.style.position = "fixed";
    input.style.left = "-10000px";

    const cleanup = () => {
      input.removeEventListener("change", handleChange);
      input.removeEventListener("cancel", handleCancel);
      input.remove();
    };
    const handleChange = () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file ? { file, handle: null } : null);
    };
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    input.addEventListener("change", handleChange);
    input.addEventListener("cancel", handleCancel);
    documentRef.body?.append(input);
    input.click();
  });
}

function downloadBlob(blob: Blob, suggestedName: string, environment: BrowserFileEnvironment): void {
  const documentRef = environment.document ?? globalThis.document;
  const urlRef = environment.url ?? globalThis.URL;
  if (!documentRef || !urlRef) {
    return;
  }
  const href = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = href;
  anchor.download = suggestedName;
  anchor.style.display = "none";
  documentRef.body?.append(anchor);
  anchor.click();
  anchor.remove();
  urlRef.revokeObjectURL(href);
}

function toFilePickerAcceptTypes(accepts: BrowserFileAccept[] | undefined): BrowserFilePickerAcceptType[] | undefined {
  const types = accepts?.map((accept) => {
    const mimeTypes = accept.mime_types?.length ? accept.mime_types : ["application/octet-stream"];
    const extensions = accept.extensions?.map((extension) => extension.startsWith(".") ? extension : `.${extension}`) ?? [];
    return {
      description: accept.description,
      accept: Object.fromEntries(mimeTypes.map((mimeType) => [mimeType, extensions])),
    };
  });
  return types?.length ? types : undefined;
}

function toInputAccept(accepts: BrowserFileAccept[] | undefined): string {
  return accepts
    ?.flatMap((accept) => [
      ...(accept.mime_types ?? []),
      ...(accept.extensions ?? []).map((extension) => extension.startsWith(".") ? extension : `.${extension}`),
    ])
    .join(",") ?? "";
}

function bytesToBlob(bytes: Uint8Array, mimeType: string | undefined): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: mimeType ?? "application/octet-stream" });
}
