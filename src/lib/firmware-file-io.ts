import { formatUnknownError } from "./error-format";

const DEFAULT_APJ_FILE_NAME = "ironwing-firmware.apj";
const DEFAULT_BIN_FILE_NAME = "ironwing-recovery.bin";
const APJ_IMPORT_UNAVAILABLE_MESSAGE = "This browser cannot open .apj firmware files right now.";
const BIN_IMPORT_UNAVAILABLE_MESSAGE = "This browser cannot open .bin firmware files right now.";
const MALFORMED_FILE_MESSAGE = "The selected firmware file could not be read.";
const EMPTY_APJ_MESSAGE = "The selected .apj firmware file was empty.";
const EMPTY_BIN_MESSAGE = "The selected .bin firmware file was empty.";
const UNSUPPORTED_APJ_MESSAGE = "Only .apj firmware files are supported here.";
const UNSUPPORTED_BIN_MESSAGE = "Only .bin firmware files are supported here.";

const APJ_ACCEPT = {
  "application/octet-stream": [".apj"],
  "application/json": [".apj"],
  "text/plain": [".apj"],
} satisfies Record<string, string[]>;

const BIN_ACCEPT = {
  "application/octet-stream": [".bin"],
} satisfies Record<string, string[]>;

type FirmwareBinaryKind = "apj" | "bin";

type BrowserOpenFileHandle = {
  getFile(): Promise<File>;
};

type BrowserFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserOpenFileHandle[]>;
};

export type FirmwareLocalApjSelection = {
  kind: "local_apj_bytes";
  data: number[];
  fileName: string | null;
  byteLength: number;
  digest: string;
};

export type FirmwareLocalBinSelection = {
  kind: "local_bin_bytes";
  data: number[];
  fileName: string | null;
  byteLength: number;
  digest: string;
};

export type FirmwareFileLoadResult<TSelection> =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    selection: TSelection;
  };

export type FirmwareFileIo = {
  pickApjFile(suggestedName?: string): Promise<FirmwareFileLoadResult<FirmwareLocalApjSelection>>;
  pickBinFile(suggestedName?: string): Promise<FirmwareFileLoadResult<FirmwareLocalBinSelection>>;
};

export type FirmwareFileIoDependencies = {
  openBinaryFile?: (
    kind: FirmwareBinaryKind,
    suggestedName?: string,
  ) => Promise<{ name: string | null; bytes: Uint8Array | ArrayBuffer | number[] } | null>;
  formatError?: (error: unknown) => string;
};

export function createFirmwareFileIo(
  dependencies: FirmwareFileIoDependencies = {},
): FirmwareFileIo {
  const openBinaryFile = dependencies.openBinaryFile ?? openBinaryFileWithBrowserApis;
  const formatError = dependencies.formatError ?? formatUnknownError;

  return {
    async pickApjFile(suggestedName = DEFAULT_APJ_FILE_NAME) {
      const selected = await openBinaryFile(kindForSelection("apj"), suggestedName);
      if (!selected) {
        return { status: "cancelled" };
      }

      const normalized = normalizeBinarySelection("apj", selected);
      return {
        status: "success",
        selection: {
          kind: "local_apj_bytes",
          data: normalized.bytes,
          fileName: normalized.name,
          byteLength: normalized.bytes.length,
          digest: normalized.digest,
        },
      };
    },

    async pickBinFile(suggestedName = DEFAULT_BIN_FILE_NAME) {
      const selected = await openBinaryFile(kindForSelection("bin"), suggestedName);
      if (!selected) {
        return { status: "cancelled" };
      }

      const normalized = normalizeBinarySelection("bin", selected);
      return {
        status: "success",
        selection: {
          kind: "local_bin_bytes",
          data: normalized.bytes,
          fileName: normalized.name,
          byteLength: normalized.bytes.length,
          digest: normalized.digest,
        },
      };
    },
  };

  async function openBinaryFileWithBrowserApis(kind: FirmwareBinaryKind, _suggestedName?: string) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showOpenFilePicker === "function") {
      return openBinaryFileWithPicker(browserWindow.showOpenFilePicker, kind, formatError);
    }

    return openBinaryFileWithInput(kind, formatError);
  }
}

function normalizeBinarySelection(
  kind: FirmwareBinaryKind,
  value: { name: string | null; bytes: Uint8Array | ArrayBuffer | number[] },
): { name: string | null; bytes: number[]; digest: string } {
  const expectedExtension = `.${kind}`;
  const fileName = typeof value.name === "string" ? value.name : null;
  if (!fileName || !fileName.toLowerCase().endsWith(expectedExtension)) {
    throw new Error(kind === "apj" ? UNSUPPORTED_APJ_MESSAGE : UNSUPPORTED_BIN_MESSAGE);
  }

  const bytes = normalizeBytes(value.bytes);
  if (bytes.length === 0) {
    throw new Error(kind === "apj" ? EMPTY_APJ_MESSAGE : EMPTY_BIN_MESSAGE);
  }

  return {
    name: fileName,
    bytes,
    digest: fnv1a64Digest(bytes),
  };
}

function normalizeBytes(value: Uint8Array | ArrayBuffer | number[]): number[] {
  if (value instanceof Uint8Array) {
    return [...value];
  }

  if (value instanceof ArrayBuffer) {
    return [...new Uint8Array(value)];
  }

  if (Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isInteger(item))) {
    return value.map((item) => item & 0xff);
  }

  throw new Error(MALFORMED_FILE_MESSAGE);
}

function kindForSelection(kind: FirmwareBinaryKind): FirmwareBinaryKind {
  return kind;
}

async function openBinaryFileWithPicker(
  showOpenFilePicker: NonNullable<BrowserFilePickerWindow["showOpenFilePicker"]>,
  kind: FirmwareBinaryKind,
  formatError: (error: unknown) => string,
) {
  try {
    const handles = await showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: kind === "apj" ? "ArduPilot APJ firmware files" : "Raw BIN firmware files",
          accept: kind === "apj" ? APJ_ACCEPT : BIN_ACCEPT,
        },
      ],
    });

    const handle = handles[0];
    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    return {
      name: file.name,
      bytes: await file.arrayBuffer(),
    };
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }

    throw new Error(formatError(error));
  }
}

function openBinaryFileWithInput(
  kind: FirmwareBinaryKind,
  formatError: (error: unknown) => string,
): Promise<{ name: string | null; bytes: Uint8Array | ArrayBuffer } | null> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error(kind === "apj" ? APJ_IMPORT_UNAVAILABLE_MESSAGE : BIN_IMPORT_UNAVAILABLE_MESSAGE));
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", onChange);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
    };

    const settle = (value: { name: string | null; bytes: Uint8Array | ArrayBuffer } | null) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    const onWindowFocus = () => {
      window.setTimeout(() => {
        if (!settled && (!input.files || input.files.length === 0)) {
          settle(null);
        }
      }, 0);
    };

    const onChange = async () => {
      const file = input.files?.[0];
      if (!file) {
        settle(null);
        return;
      }

      try {
        settle({
          name: file.name,
          bytes: await file.arrayBuffer(),
        });
      } catch (error) {
        cleanup();
        reject(new Error(formatError(error)));
      }
    };

    input.type = "file";
    input.accept = kind === "apj" ? ".apj,application/octet-stream,application/json,text/plain" : ".bin,application/octet-stream";
    input.style.display = "none";
    input.addEventListener("change", onChange, { once: true });
    window.addEventListener("focus", onWindowFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function isAbortError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }

  return Boolean(
    error
      && typeof error === "object"
      && "name" in error
      && (error as { name?: string }).name === "AbortError",
  );
}

function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}
