const DEFAULT_RECORDING_FILE_NAME = "manual-capture.tlog";

export function defaultManualRecordingPath(directory: string): string {
  return joinDirectoryAndFile(directory, DEFAULT_RECORDING_FILE_NAME);
}

type BrowserSaveFileHandle = {
  name?: string;
};

type BrowserFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserSaveFileHandle>;
};

export type LogRecordingFileIo = {
  supportsManualPicker(): boolean;
  pickManualRecordingPath(args: { suggestedPath: string }): Promise<string | null>;
};

export function createLogRecordingFileIo(browserWindow: BrowserFilePickerWindow | null = typeof window === "undefined" ? null : window as BrowserFilePickerWindow): LogRecordingFileIo {
  return {
    supportsManualPicker() {
      return Boolean(browserWindow && typeof browserWindow.showSaveFilePicker === "function");
    },

    async pickManualRecordingPath({ suggestedPath }) {
      if (!browserWindow || typeof browserWindow.showSaveFilePicker !== "function") {
        return null;
      }

      try {
        const handle = await browserWindow.showSaveFilePicker({
          suggestedName: fileNameFromPath(suggestedPath),
          excludeAcceptAllOption: false,
          types: [
            {
              description: "Telemetry logs",
              accept: {
                "application/octet-stream": [".tlog"],
                "text/plain": [".tlog"],
              },
            },
          ],
        });

        const pickedName = normalizeFileName(handle.name);
        return joinDirectoryAndFile(directoryFromPath(suggestedPath), pickedName);
      } catch (error) {
        if (isAbortError(error)) {
          return null;
        }

        throw error;
      }
    },
  };
}

function fileNameFromPath(path: string): string {
  const normalized = path.trim();
  if (normalized.length === 0) {
    return DEFAULT_RECORDING_FILE_NAME;
  }

  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return normalizeFileName(parts[parts.length - 1]);
}

function directoryFromPath(path: string): string {
  const normalized = path.trim();
  if (normalized.length === 0) {
    return "";
  }

  const separatorIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (separatorIndex < 0) {
    return "";
  }

  return normalized.slice(0, separatorIndex);
}

function normalizeFileName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : DEFAULT_RECORDING_FILE_NAME;
}

function joinDirectoryAndFile(directory: string, fileName: string): string {
  if (directory.length === 0) {
    return fileName;
  }

  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  const trimmedDirectory = directory.replace(/[\\/]+$/, "");
  return `${trimmedDirectory}${separator}${fileName}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
