import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  createParamsService,
  type ParamsService,
} from "../platform/params";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "./parameter-item-model";

const DEFAULT_PARAM_FILE_NAME = "ironwing-parameters.param";
const MALFORMED_PARSE_RESPONSE_MESSAGE = "The parameter file parser returned an unexpected response.";
const MALFORMED_FORMAT_RESPONSE_MESSAGE = "The parameter export formatter returned an unexpected response.";
const IMPORT_UNAVAILABLE_MESSAGE = "No parameter snapshot is available to import against.";
const EXPORT_UNAVAILABLE_MESSAGE = "No parameter snapshot is available to export.";

type BrowserOpenFileHandle = {
  getFile(): Promise<File>;
};

type BrowserSaveFileWriter = {
  write(data: string): Promise<void>;
  close(): Promise<void>;
};

type BrowserSaveFileHandle = {
  name?: string;
  createWritable(): Promise<BrowserSaveFileWriter>;
};

type BrowserFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserOpenFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserSaveFileHandle>;
};

export type ParameterFileImportRow = {
  item: ParameterItemModel;
  nextValue: number;
};

export type ParameterFileImportResult =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    fileName: string | null;
    totalRows: number;
    stagedRows: ParameterFileImportRow[];
    stagedCount: number;
    skippedUnknownCount: number;
    skippedUnchangedCount: number;
    skippedCount: number;
  };

export type ParameterFileExportResult =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    fileName: string | null;
    paramCount: number;
    contents: string;
  };

export type ParameterFileIo = {
  importFromPicker(args: {
    paramStore: ParamStore | null;
    metadata: ParamMetadataMap | null;
    suggestedName?: string;
  }): Promise<ParameterFileImportResult>;
  exportToPicker(args: {
    paramStore: ParamStore | null;
    suggestedName?: string;
  }): Promise<ParameterFileExportResult>;
};

export type ParameterFileIoDependencies = {
  paramsService?: Pick<ParamsService, "parseFile" | "formatFile" | "formatError">;
  openTextFile?: (suggestedName?: string) => Promise<{ name: string | null; contents: string } | null>;
  saveTextFile?: (args: { suggestedName: string; contents: string }) => Promise<{ name: string | null } | null>;
};

export function createParameterFileIo(
  dependencies: ParameterFileIoDependencies = {},
): ParameterFileIo {
  const paramsService = dependencies.paramsService ?? createParamsService();
  const openTextFile = dependencies.openTextFile ?? openTextFileWithBrowserApis;
  const saveTextFile = dependencies.saveTextFile ?? saveTextFileWithBrowserApis;

  return {
    async importFromPicker({ paramStore, metadata, suggestedName = DEFAULT_PARAM_FILE_NAME }) {
      if (!paramStore) {
        throw new Error(IMPORT_UNAVAILABLE_MESSAGE);
      }

      const selected = await openTextFile(suggestedName);
      if (!selected) {
        return { status: "cancelled" };
      }

      const parsed = normalizeParsedParams(await paramsService.parseFile(selected.contents));
      const itemIndex = buildParameterItemIndex(paramStore, metadata);
      const stagedRows: ParameterFileImportRow[] = [];
      let skippedUnknownCount = 0;
      let skippedUnchangedCount = 0;

      for (const [name, nextValue] of Object.entries(parsed)) {
        const item = itemIndex.get(name);
        const currentValue = paramStore.params[name]?.value;
        if (!item || typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
          skippedUnknownCount += 1;
          continue;
        }

        if (currentValue === nextValue) {
          skippedUnchangedCount += 1;
          continue;
        }

        stagedRows.push({ item, nextValue });
      }

      stagedRows.sort((left, right) => left.item.order - right.item.order || left.item.name.localeCompare(right.item.name));

      return {
        status: "success",
        fileName: selected.name,
        totalRows: Object.keys(parsed).length,
        stagedRows,
        stagedCount: stagedRows.length,
        skippedUnknownCount,
        skippedUnchangedCount,
        skippedCount: skippedUnknownCount + skippedUnchangedCount,
      };
    },

    async exportToPicker({ paramStore, suggestedName = DEFAULT_PARAM_FILE_NAME }) {
      if (!paramStore) {
        throw new Error(EXPORT_UNAVAILABLE_MESSAGE);
      }

      const contents = await paramsService.formatFile(paramStore);
      if (typeof contents !== "string") {
        throw new Error(MALFORMED_FORMAT_RESPONSE_MESSAGE);
      }

      const saved = await saveTextFile({
        suggestedName,
        contents,
      });
      if (!saved) {
        return { status: "cancelled" };
      }

      return {
        status: "success",
        fileName: saved.name,
        paramCount: Object.keys(paramStore.params).length,
        contents,
      };
    },
  };

  function normalizeParsedParams(value: unknown): Record<string, number> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(MALFORMED_PARSE_RESPONSE_MESSAGE);
    }

    const normalized: Record<string, number> = {};
    for (const [rawName, rawValue] of Object.entries(value)) {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (name.length === 0 || typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new Error(MALFORMED_PARSE_RESPONSE_MESSAGE);
      }

      normalized[name] = rawValue;
    }

    return normalized;
  }

  function openTextFileWithBrowserApis(_suggestedName?: string) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showOpenFilePicker === "function") {
      return openTextFileWithPicker(browserWindow.showOpenFilePicker);
    }

    return openTextFileWithInput();
  }

  async function saveTextFileWithBrowserApis({ suggestedName, contents }: { suggestedName: string; contents: string }) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showSaveFilePicker === "function") {
      return saveTextFileWithPicker(browserWindow.showSaveFilePicker, suggestedName, contents);
    }

    if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
      throw new Error("This browser cannot save parameter files.");
    }

    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    link.href = objectUrl;
    link.download = suggestedName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    return { name: suggestedName };
  }

  async function openTextFileWithPicker(
    showOpenFilePicker: NonNullable<BrowserFilePickerWindow["showOpenFilePicker"]>,
  ) {
    try {
      const handles = await showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "ArduPilot parameter files",
            accept: { "text/plain": [".param", ".txt"] },
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
        contents: await file.text(),
      };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }

      throw new Error(paramsService.formatError(error));
    }
  }

  function openTextFileWithInput(): Promise<{ name: string | null; contents: string } | null> {
    if (typeof document === "undefined") {
      return Promise.reject(new Error("This browser cannot open parameter files."));
    }

    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      let settled = false;

      const cleanup = () => {
        input.removeEventListener("change", onChange);
        window.removeEventListener("focus", onWindowFocus);
        input.remove();
      };

      const settle = (value: { name: string | null; contents: string } | null) => {
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
            contents: await file.text(),
          });
        } catch (error) {
          cleanup();
          reject(new Error(paramsService.formatError(error)));
        }
      };

      input.type = "file";
      input.accept = ".param,.txt,text/plain";
      input.style.display = "none";
      input.addEventListener("change", onChange, { once: true });
      window.addEventListener("focus", onWindowFocus, { once: true });
      document.body.appendChild(input);
      input.click();
    });
  }

  async function saveTextFileWithPicker(
    showSaveFilePicker: NonNullable<BrowserFilePickerWindow["showSaveFilePicker"]>,
    suggestedName: string,
    contents: string,
  ) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: "ArduPilot parameter files",
            accept: { "text/plain": [".param", ".txt"] },
          },
        ],
      });
      if (!handle) {
        return null;
      }

      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return { name: handle.name ?? suggestedName };
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }

      throw new Error(paramsService.formatError(error));
    }
  }
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
