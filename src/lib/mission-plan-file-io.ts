import {
  exportPlanFile,
  parsePlanFile,
  type ExportDomain,
  type ExportableSurveyRegion,
  type ParsedSurveyRegion,
} from "./mission-plan-io";
import type { FencePlan, HomePosition, MissionPlan, RallyPlan } from "./mavkit-types";
import { formatUnknownError } from "./error-format";

const DEFAULT_PLAN_FILE_NAME = "ironwing-mission.plan";
const IMPORT_UNAVAILABLE_MESSAGE = "This browser cannot open .plan files right now.";
const EXPORT_UNAVAILABLE_MESSAGE = "This browser cannot save .plan files right now.";
const INVALID_JSON_MESSAGE = "The selected .plan file was not valid JSON.";
const MALFORMED_PLAN_MESSAGE = "The selected .plan file did not contain a valid QGroundControl plan object.";
const EMPTY_PLAN_MESSAGE = "The selected .plan file did not contain any mission, survey, fence, rally, or home data.";
const MALFORMED_EXPORT_MESSAGE = "The .plan exporter returned an unexpected payload.";

const FATAL_IMPORT_WARNING_PATTERNS = [
  /plan file is not valid json/i,
  /plan input was neither/i,
  /falling back to flattened simpleitems/i,
  /loses survey\/corridor metadata/i,
  /was skipped\.?$/i,
];

const SUPPORTED_PLAN_ACCEPT = {
  "application/json": [".plan", ".json"],
  "text/plain": [".plan", ".json"],
} satisfies Record<string, string[]>;

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

export type MissionPlanFileImportData = {
  mission: MissionPlan;
  surveyRegions: ParsedSurveyRegion[];
  home: HomePosition | null;
  fence: FencePlan;
  rally: RallyPlan;
  cruiseSpeed: number;
  hoverSpeed: number;
};

export type MissionPlanFileImportResult =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    fileName: string | null;
    missionItemCount: number;
    surveyRegionCount: number;
    fenceRegionCount: number;
    rallyPointCount: number;
    warningCount: number;
    warnings: string[];
    data: MissionPlanFileImportData;
  };

export type MissionPlanFileExportInput = {
  mission: MissionPlan;
  surveyRegions?: ExportableSurveyRegion[];
  home: HomePosition | null;
  fence: FencePlan;
  rally: RallyPlan;
  cruiseSpeed?: number;
  hoverSpeed?: number;
  excludeDomains?: ExportDomain[];
  suggestedName?: string;
};

export type MissionPlanFileExportResult =
  | {
    status: "cancelled";
  }
  | {
    status: "success";
    fileName: string | null;
    warningCount: number;
    warnings: string[];
    contents: string;
  };

export type MissionPlanFileIo = {
  importFromPicker(suggestedName?: string): Promise<MissionPlanFileImportResult>;
  exportToPicker(input: MissionPlanFileExportInput): Promise<MissionPlanFileExportResult>;
};

export type MissionPlanFileIoDependencies = {
  openTextFile?: (suggestedName?: string) => Promise<{ name: string | null; contents: string } | null>;
  saveTextFile?: (args: { suggestedName: string; contents: string }) => Promise<{ name: string | null } | null>;
  parsePlan?: typeof parsePlanFile;
  exportPlan?: typeof exportPlanFile;
  formatError?: (error: unknown) => string;
};

export function createMissionPlanFileIo(
  dependencies: MissionPlanFileIoDependencies = {},
): MissionPlanFileIo {
  const openTextFile = dependencies.openTextFile ?? openTextFileWithBrowserApis;
  const saveTextFile = dependencies.saveTextFile ?? saveTextFileWithBrowserApis;
  const parsePlan = dependencies.parsePlan ?? parsePlanFile;
  const exportPlan = dependencies.exportPlan ?? exportPlanFile;
  const formatError = dependencies.formatError ?? formatUnknownError;

  return {
    async importFromPicker(suggestedName = DEFAULT_PLAN_FILE_NAME) {
      const selected = await openTextFile(suggestedName);
      if (!selected) {
        return { status: "cancelled" };
      }

      return parseMissionPlanImportSelection(selected, { parsePlan });
    },

    async exportToPicker(input: MissionPlanFileExportInput) {
      const suggestedName = input.suggestedName ?? DEFAULT_PLAN_FILE_NAME;
      const exported = exportPlan({
        mission: input.mission,
        surveyRegions: input.surveyRegions,
        home: input.home,
        fence: input.fence,
        rally: input.rally,
        cruiseSpeed: input.cruiseSpeed,
        hoverSpeed: input.hoverSpeed,
        excludeDomains: input.excludeDomains,
      });

      if (!exported || typeof exported !== "object" || !exported.json || typeof exported.json !== "object" || !Array.isArray(exported.warnings)) {
        throw new Error(MALFORMED_EXPORT_MESSAGE);
      }

      const contents = `${JSON.stringify(exported.json, null, 2)}\n`;
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
        warningCount: exported.warnings.length,
        warnings: [...exported.warnings],
        contents,
      };
    },
  };

  async function openTextFileWithBrowserApis(_suggestedName?: string) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showOpenFilePicker === "function") {
      return openTextFileWithPicker(browserWindow.showOpenFilePicker, formatError);
    }

    return openTextFileWithInput(formatError);
  }

  async function saveTextFileWithBrowserApis({ suggestedName, contents }: { suggestedName: string; contents: string }) {
    const browserWindow = window as BrowserFilePickerWindow;

    if (typeof browserWindow.showSaveFilePicker === "function") {
      return saveTextFileWithPicker(browserWindow.showSaveFilePicker, suggestedName, contents, formatError);
    }

    if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") {
      throw new Error(EXPORT_UNAVAILABLE_MESSAGE);
    }

    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    link.href = objectUrl;
    link.download = suggestedName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    return { name: suggestedName };
  }
}

export function parseMissionPlanImportSelection(
  selected: { name: string | null; contents: string },
  dependencies: Pick<MissionPlanFileIoDependencies, "parsePlan"> = {},
): Extract<MissionPlanFileImportResult, { status: "success" }> {
  const parsePlan = dependencies.parsePlan ?? parsePlanFile;
  const rawPlan = parsePlanJson(selected.contents);
  const parsed = parsePlan(rawPlan);
  const fatalWarning = parsed.warnings.find((warning) => FATAL_IMPORT_WARNING_PATTERNS.some((pattern) => pattern.test(warning)));
  if (fatalWarning) {
    throw new Error(toImportFailureMessage(fatalWarning));
  }

  if (isEmptyImportedPlan(parsed)) {
    throw new Error(EMPTY_PLAN_MESSAGE);
  }

  return {
    status: "success",
    fileName: selected.name,
    missionItemCount: parsed.mission.items.length,
    surveyRegionCount: parsed.surveyRegions.length,
    fenceRegionCount: parsed.fence.regions.length,
    rallyPointCount: parsed.rally.points.length,
    warningCount: parsed.warnings.length,
    warnings: [...parsed.warnings],
    data: {
      mission: parsed.mission,
      surveyRegions: parsed.surveyRegions,
      home: parsed.home,
      fence: parsed.fence,
      rally: parsed.rally,
      cruiseSpeed: parsed.cruiseSpeed,
      hoverSpeed: parsed.hoverSpeed,
    },
  };
}

function parsePlanJson(contents: string): object {
  try {
    const parsed = JSON.parse(contents) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(MALFORMED_PLAN_MESSAGE);
    }

    return parsed as object;
  } catch (error) {
    if (error instanceof Error && error.message === MALFORMED_PLAN_MESSAGE) {
      throw error;
    }

    throw new Error(INVALID_JSON_MESSAGE);
  }
}

function isEmptyImportedPlan(input: MissionPlanFileImportData): boolean {
  return input.mission.items.length === 0
    && input.surveyRegions.length === 0
    && input.fence.regions.length === 0
    && input.rally.points.length === 0
    && input.home === null;
}

function toImportFailureMessage(warning: string): string {
  if (/loses survey\/corridor metadata/i.test(warning)) {
    return "The selected .plan file contains unsupported ComplexItem data that IronWing would import lossily.";
  }

  if (/falling back to flattened simpleitems/i.test(warning)) {
    return "The selected .plan file contains malformed survey geometry that IronWing cannot preserve safely.";
  }

  if (/plan file is not valid json/i.test(warning) || /plan input was neither/i.test(warning)) {
    return INVALID_JSON_MESSAGE;
  }

  return `The selected .plan file contains malformed data: ${warning}`;
}

async function openTextFileWithPicker(
  showOpenFilePicker: NonNullable<BrowserFilePickerWindow["showOpenFilePicker"]>,
  formatError: (error: unknown) => string,
) {
  try {
    const handles = await showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: "QGroundControl plan files",
          accept: SUPPORTED_PLAN_ACCEPT,
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

    throw new Error(formatError(error));
  }
}

function openTextFileWithInput(
  formatError: (error: unknown) => string,
): Promise<{ name: string | null; contents: string } | null> {
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
        reject(new Error(formatError(error)));
      }
    };

    input.type = "file";
    input.accept = ".plan,.json,application/json,text/plain";
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
  formatError: (error: unknown) => string,
) {
  try {
    const handle = await showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "QGroundControl plan files",
          accept: SUPPORTED_PLAN_ACCEPT,
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

    throw new Error(formatError(error));
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
