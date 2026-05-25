import { formatUnknownError } from "../error-format";
import { detectKmlSource } from "../mission-kml-file-io";

const SUPPORTED_TOOLBAR_IMPORT_ACCEPT = {
  "application/json": [".plan", ".json"],
  "text/plain": [".plan", ".json", ".kml"],
  "application/vnd.google-earth.kml+xml": [".kml"],
  "application/vnd.google-earth.kmz": [".kmz"],
  "application/xml": [".kml"],
  "text/xml": [".kml"],
  "application/octet-stream": [".kmz"],
} satisfies Record<string, string[]>;

const TOOLBAR_IMPORT_INPUT_ACCEPT = ".plan,.json,.kml,.kmz,application/json,text/plain,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,text/xml,application/xml,application/octet-stream";

type BrowserOpenFileHandle = {
  getFile(): Promise<File>;
};

type BrowserMissionImportPickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserOpenFileHandle[]>;
};

type ToolbarImportSelection =
  | {
    source: "plan";
    name: string | null;
    contents: string;
  }
  | {
    source: "kml" | "kmz";
    name: string | null;
    text?: string;
    bytes?: Uint8Array | ArrayBuffer;
  };

export async function openToolbarImportPicker(
  formatError: (error: unknown) => string = formatUnknownError,
): Promise<ToolbarImportSelection | null> {
  const browserWindow = window as BrowserMissionImportPickerWindow;

  if (typeof browserWindow.showOpenFilePicker === "function") {
    return openToolbarImportPickerWithHandle(browserWindow.showOpenFilePicker, formatError);
  }

  return openToolbarImportPickerWithInput(formatError);
}

function detectToolbarImportSource(name: string | null | undefined, mimeType: string | null | undefined): ToolbarImportSelection["source"] {
  const loweredName = name?.toLowerCase() ?? "";
  if (loweredName.endsWith(".plan") || loweredName.endsWith(".json") || mimeType === "application/json") {
    return "plan";
  }

  return detectKmlSource(name, mimeType);
}

async function readToolbarImportSelection(file: File): Promise<ToolbarImportSelection> {
  const source = detectToolbarImportSource(file.name, file.type);
  if (source === "plan") {
    return {
      source,
      name: file.name,
      contents: await file.text(),
    };
  }

  if (source === "kmz") {
    return {
      source,
      name: file.name,
      bytes: await file.arrayBuffer(),
    };
  }

  return {
    source,
    name: file.name,
    text: await file.text(),
  };
}

async function openToolbarImportPickerWithHandle(
  showOpenFilePicker: NonNullable<BrowserMissionImportPickerWindow["showOpenFilePicker"]>,
  formatError: (error: unknown) => string,
): Promise<ToolbarImportSelection | null> {
  try {
    const handles = await showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "Mission plan, KML, and KMZ files",
          accept: SUPPORTED_TOOLBAR_IMPORT_ACCEPT,
        },
      ],
    });
    const handle = handles[0];
    if (!handle) {
      return null;
    }

    return readToolbarImportSelection(await handle.getFile());
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }

    throw new Error(formatError(error));
  }
}

function openToolbarImportPickerWithInput(
  formatError: (error: unknown) => string,
): Promise<ToolbarImportSelection | null> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("This browser cannot open mission import files right now."));
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    let settled = false;

    const cleanup = () => {
      input.removeEventListener("change", onChange);
      window.removeEventListener("focus", onWindowFocus);
      input.remove();
    };

    const settle = (value: ToolbarImportSelection | null) => {
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
        settle(await readToolbarImportSelection(file));
      } catch (error) {
        cleanup();
        reject(new Error(formatError(error)));
      }
    };

    input.type = "file";
    input.accept = TOOLBAR_IMPORT_INPUT_ACCEPT;
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
