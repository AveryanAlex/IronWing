import type { FencePlan, MissionPlan } from "./mavkit-types";
import { formatUnknownError } from "./error-format";
import { parseKml, parseKmz, type KmlParseResult } from "./mission-kml-io";

const DEFAULT_KML_FILE_NAME = "ironwing-mission.kml";
const IMPORT_UNAVAILABLE_MESSAGE = "This browser cannot open .kml or .kmz files right now.";
const EMPTY_IMPORT_MESSAGE = "The selected KML/KMZ file did not contain supported mission or fence geometry.";
const MALFORMED_IMPORT_MESSAGE = "The selected file could not be read as KML or KMZ content.";

const SUPPORTED_KML_ACCEPT = {
  "application/vnd.google-earth.kml+xml": [".kml"],
  "application/vnd.google-earth.kmz": [".kmz"],
  "application/xml": [".kml"],
  "text/xml": [".kml"],
  "text/plain": [".kml"],
  "application/octet-stream": [".kmz"],
} satisfies Record<string, string[]>;

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

export type MissionKmlFileImportData = {
  mission: MissionPlan;
  fence: FencePlan;
};

export type MissionKmlFileImportResult =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    source: "kml" | "kmz";
    fileName: string | null;
    missionItemCount: number;
    fenceRegionCount: number;
    warningCount: number;
    warnings: string[];
    data: MissionKmlFileImportData;
  };

export type MissionKmlFileIo = {
  importFromPicker(suggestedName?: string): Promise<MissionKmlFileImportResult>;
};

export type MissionKmlFileIoDependencies = {
  openFile?: (suggestedName?: string) => Promise<{
    name: string | null;
    source: "kml" | "kmz";
    text?: string;
    bytes?: Uint8Array | ArrayBuffer;
  } | null>;
  parseKmlFile?: typeof parseKml;
  parseKmzFile?: typeof parseKmz;
  formatError?: (error: unknown) => string;
};

export function createMissionKmlFileIo(
  dependencies: MissionKmlFileIoDependencies = {},
): MissionKmlFileIo {
  const openFile = dependencies.openFile ?? openKmlFileWithBrowserApis;
  const parseKmlFile = dependencies.parseKmlFile ?? parseKml;
  const parseKmzFile = dependencies.parseKmzFile ?? parseKmz;
  const formatError = dependencies.formatError ?? formatUnknownError;

  return {
    async importFromPicker(suggestedName = DEFAULT_KML_FILE_NAME) {
      const selected = await openFile(suggestedName);
      if (!selected) {
        return { status: "cancelled" };
      }

      const parsed = selected.source === "kmz"
        ? parseKmzImport(selected, parseKmzFile)
        : parseKmlImport(selected, parseKmlFile);

      if (parsed.fenceRegions.length === 0 && parsed.missionItems.length === 0) {
        throw new Error(formatEmptyImportMessage(parsed.warnings));
      }

      return {
        status: "success",
        source: selected.source,
        fileName: selected.name,
        missionItemCount: parsed.missionItems.length,
        fenceRegionCount: parsed.fenceRegions.length,
        warningCount: parsed.warnings.length,
        warnings: [...parsed.warnings],
        data: {
          mission: { items: parsed.missionItems },
          fence: { return_point: null, regions: parsed.fenceRegions },
        },
      };
    },
  };

  async function openKmlFileWithBrowserApis(_suggestedName?: string) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showOpenFilePicker === "function") {
      return openKmlFileWithPicker(browserWindow.showOpenFilePicker, formatError);
    }

    return openKmlFileWithInput(formatError);
  }
}

function parseKmlImport(
  selected: { text?: string; name: string | null },
  parseKmlFile: typeof parseKml,
): KmlParseResult {
  if (typeof selected.text !== "string") {
    throw new Error(MALFORMED_IMPORT_MESSAGE);
  }

  return parseKmlFile(selected.text);
}

function parseKmzImport(
  selected: { bytes?: Uint8Array | ArrayBuffer; name: string | null },
  parseKmzFile: typeof parseKmz,
): KmlParseResult {
  if (!(selected.bytes instanceof Uint8Array) && !(selected.bytes instanceof ArrayBuffer)) {
    throw new Error(MALFORMED_IMPORT_MESSAGE);
  }

  return parseKmzFile(selected.bytes);
}

function formatEmptyImportMessage(warnings: string[]): string {
  if (warnings.length === 0) {
    return EMPTY_IMPORT_MESSAGE;
  }

  return `${EMPTY_IMPORT_MESSAGE} ${warnings.join(" ")}`;
}

async function openKmlFileWithPicker(
  showOpenFilePicker: NonNullable<BrowserFilePickerWindow["showOpenFilePicker"]>,
  formatError: (error: unknown) => string,
) {
  try {
    const handles = await showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "KML and KMZ files",
          accept: SUPPORTED_KML_ACCEPT,
        },
      ],
    });
    const handle = handles[0];
    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    return readSelectedFile(file);
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }

    throw new Error(formatError(error));
  }
}

function openKmlFileWithInput(
  formatError: (error: unknown) => string,
): Promise<{
  name: string | null;
  source: "kml" | "kmz";
  text?: string;
  bytes?: Uint8Array | ArrayBuffer;
} | null> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error(IMPORT_UNAVAILABLE_MESSAGE));
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", onChange);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
    };

    const settle = (value: {
      name: string | null;
      source: "kml" | "kmz";
      text?: string;
      bytes?: Uint8Array | ArrayBuffer;
    } | null) => {
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
        settle(await readSelectedFile(file));
      } catch (error) {
        cleanup();
        reject(new Error(formatError(error)));
      }
    };

    input.type = "file";
    input.accept = ".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml,application/xml,application/octet-stream";
    input.style.display = "none";
    input.addEventListener("change", onChange, { once: true });
    window.addEventListener("focus", onWindowFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

async function readSelectedFile(file: File): Promise<{
  name: string | null;
  source: "kml" | "kmz";
  text?: string;
  bytes?: Uint8Array | ArrayBuffer;
}> {
  const source = detectKmlSource(file.name, file.type);
  if (source === "kmz") {
    return {
      name: file.name,
      source,
      bytes: await file.arrayBuffer(),
    };
  }

  return {
    name: file.name,
    source,
    text: await file.text(),
  };
}

function detectKmlSource(name: string | null | undefined, mimeType: string | null | undefined): "kml" | "kmz" {
  const loweredName = name?.toLowerCase() ?? "";
  if (loweredName.endsWith(".kmz") || mimeType === "application/vnd.google-earth.kmz") {
    return "kmz";
  }

  return "kml";
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
