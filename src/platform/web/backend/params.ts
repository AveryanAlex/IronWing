import {
  wasmParamCancel,
  wasmParamDownloadAll,
  wasmParamFormatFile,
  wasmParamParseFile,
  wasmParamWrite,
  wasmParamWriteBatch,
} from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";

export const paramCommandHandlers = definePlatformCommandHandlers({
  param_download_all: async () => wasmParamDownloadAll(),
  param_cancel: async () => wasmParamCancel(),
  param_write: async ({ name, value }) => wasmParamWrite(name, value),
  param_write_batch: async ({ params }) => wasmParamWriteBatch(params),
  param_parse_file: async ({ contents }) => wasmParamParseFile(contents),
  param_format_file: async ({ store }) => wasmParamFormatFile(store),
});
