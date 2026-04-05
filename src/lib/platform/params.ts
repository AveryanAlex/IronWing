import { fetchParamMetadata, type ParamMetadataMap } from "../../param-metadata";
import {
  downloadAllParams,
  formatParamFile,
  parseParamFile,
  subscribeParamProgress,
  subscribeParamStore,
  writeBatchParams,
  type ParamProgress,
  type ParamStore,
  type ParamWriteResult,
} from "../../params";
import type { SessionEvent } from "../../session";
import { formatUnknownError } from "../error-format";

export type ParamsServiceEventHandlers = {
  onStore: (event: SessionEvent<ParamStore>) => void;
  onProgress: (event: SessionEvent<ParamProgress>) => void;
};

export type ParamsService = {
  subscribeAll(handlers: ParamsServiceEventHandlers): Promise<() => void>;
  fetchMetadata(vehicleType: string): Promise<ParamMetadataMap | null>;
  downloadAll(): Promise<void>;
  writeBatch(params: [string, number][]): Promise<ParamWriteResult[]>;
  parseFile(contents: string): Promise<Record<string, number>>;
  formatFile(store: ParamStore): Promise<string>;
  formatError(error: unknown): string;
};

export function createParamsService(): ParamsService {
  return {
    subscribeAll,
    fetchMetadata: fetchParamMetadata,
    downloadAll: downloadAllParams,
    writeBatch: writeBatchParams,
    parseFile: parseParamFile,
    formatFile: formatParamFile,
    formatError: formatUnknownError,
  };
}

export async function subscribeAll(handlers: ParamsServiceEventHandlers): Promise<() => void> {
  const disposers = await Promise.all([
    subscribeParamStore(handlers.onStore),
    subscribeParamProgress(handlers.onProgress),
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
