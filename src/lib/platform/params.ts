import { fetchParamMetadata, type ParamMetadataMap } from "../../param-metadata";
import {
  cancelParamDownload,
  applyStagedParams,
  clearStagedParams,
  discardStagedParams,
  downloadAllParams,
  formatParamFile,
  parseParamFile,
  getParamStagingState,
  resetParamRebootCheckpoint,
  stageParams,
  subscribeParamProgress,
  subscribeParamStaging,
  subscribeParamStore,
  type ParamProgress,
  type ParamApplyOutcome,
  type ParamStageChange,
  type ParamStagingState,
  type ParamStore,
} from "../../params";
import type { SessionEvent } from "../../session";
import { formatUnknownError } from "../error-format";

export type ParamsServiceEventHandlers = {
  onStore: (event: SessionEvent<ParamStore>) => void;
  onProgress: (event: SessionEvent<ParamProgress>) => void;
  onStaging: (event: SessionEvent<ParamStagingState>) => void;
};

export type ParamsService = {
  subscribeAll(handlers: ParamsServiceEventHandlers): Promise<() => void>;
  fetchMetadata(vehicleType: string, firmwareVersion?: string | null): Promise<ParamMetadataMap | null>;
  downloadAll(): Promise<void>;
  cancelDownload(): Promise<void>;
  stagingSnapshot(): Promise<ParamStagingState>;
  stage(changes: ParamStageChange[], expectedRevision: number | null): Promise<ParamStagingState>;
  discard(names: string[], expectedRevision: number | null): Promise<ParamStagingState>;
  clear(expectedRevision: number | null): Promise<ParamStagingState>;
  apply(names: string[] | null, expectedRevision: number | null): Promise<ParamApplyOutcome>;
  resetRebootCheckpoint(): Promise<ParamStagingState>;
  parseFile(contents: string): Promise<Record<string, number>>;
  formatFile(store: ParamStore): Promise<string>;
  formatError(error: unknown): string;
};

export function createParamsService(): ParamsService {
  return {
    subscribeAll,
    fetchMetadata: fetchParamMetadata,
    downloadAll: downloadAllParams,
    cancelDownload: cancelParamDownload,
    stagingSnapshot: getParamStagingState,
    stage: stageParams,
    discard: discardStagedParams,
    clear: clearStagedParams,
    apply: applyStagedParams,
    resetRebootCheckpoint: resetParamRebootCheckpoint,
    parseFile: parseParamFile,
    formatFile: formatParamFile,
    formatError: formatUnknownError,
  };
}

export async function subscribeAll(handlers: ParamsServiceEventHandlers): Promise<() => void> {
  const disposers = await Promise.all([
    subscribeParamStore(handlers.onStore),
    subscribeParamProgress(handlers.onProgress),
    subscribeParamStaging(handlers.onStaging),
  ]);

  return () => {
    for (const disposer of disposers) {
      disposer();
    }
  };
}

export function asErrorMessage(error: unknown): string {
  return formatUnknownError(error);
}
