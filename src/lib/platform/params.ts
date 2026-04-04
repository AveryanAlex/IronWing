import { fetchParamMetadata, type ParamMetadataMap } from "../../param-metadata";
import {
  subscribeParamProgress,
  subscribeParamStore,
  type ParamProgress,
  type ParamStore,
} from "../../params";
import type { SessionEvent } from "../../session";

export type ParamsServiceEventHandlers = {
  onStore: (event: SessionEvent<ParamStore>) => void;
  onProgress: (event: SessionEvent<ParamProgress>) => void;
};

export type ParamsService = {
  subscribeAll(handlers: ParamsServiceEventHandlers): Promise<() => void>;
  fetchMetadata(vehicleType: string): Promise<ParamMetadataMap | null>;
  formatError(error: unknown): string;
};

export function createParamsService(): ParamsService {
  return {
    subscribeAll,
    fetchMetadata: fetchParamMetadata,
    formatError: asErrorMessage,
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
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}
