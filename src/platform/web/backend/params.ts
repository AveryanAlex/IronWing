import {
  wasmParamCancel,
  wasmParamDownloadAll,
  wasmParamFormatFile,
  wasmParamParseFile,
  wasmParamWrite,
  wasmParamWriteBatch,
} from "../wasm";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { ParamStore } from "../../../params";

export async function tryHandleParamCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "param_download_all":
      return handled(await wasmParamDownloadAll());
    case "param_cancel":
      return handled(await wasmParamCancel());
    case "param_write": {
      const [name, value] = paramWriteArgs(args);
      return handled(await wasmParamWrite(name, value));
    }
    case "param_write_batch":
      return handled(await wasmParamWriteBatch(paramWriteBatchArgs(args)));
    case "param_parse_file":
      return handled(await wasmParamParseFile(paramParseFileContents(args)));
    case "param_format_file":
      return handled(await wasmParamFormatFile(paramFormatFileStore(args)));
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

function paramWriteArgs(args?: WebCommandArgs): [string, number] {
  if (typeof args?.name !== "string" || args.name.trim().length === 0) {
    throw new Error("missing or invalid param_write.name");
  }
  if (typeof args.value !== "number" || !Number.isFinite(args.value)) {
    throw new Error("missing or invalid param_write.value");
  }

  return [args.name, args.value];
}

function paramWriteBatchArgs(args?: WebCommandArgs): [string, number][] {
  if (!Array.isArray(args?.params)) {
    throw new Error("missing or invalid param_write_batch.params");
  }

  return args.params.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`missing or invalid param_write_batch.params[${index}]`);
    }

    const [name, value] = entry;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(`missing or invalid param_write_batch.params[${index}][0]`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`missing or invalid param_write_batch.params[${index}][1]`);
    }

    return [name, value];
  });
}

function paramParseFileContents(args?: WebCommandArgs): string {
  if (typeof args?.contents !== "string") {
    throw new Error("missing or invalid param_parse_file.contents");
  }

  return args.contents;
}

function paramFormatFileStore(args?: WebCommandArgs): ParamStore {
  if (!args?.store || typeof args.store !== "object" || Array.isArray(args.store)) {
    throw new Error("missing or invalid param_format_file.store");
  }

  return args.store as ParamStore;
}
