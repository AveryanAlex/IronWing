import {
  wasmParamCancel,
  wasmParamApplyStaged,
  wasmParamClearStaged,
  wasmParamDiscardStaged,
  wasmParamDownloadAll,
  wasmParamFormatFile,
  wasmParamParseFile,
  wasmParamResetRebootCheckpoint,
  wasmParamStage,
  wasmParamStagingSnapshot,
  wasmParamWrite,
  wasmParamWriteBatch,
} from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";

export const paramCommandHandlers = definePlatformCommandHandlers({
  param_download_all: async () => wasmParamDownloadAll(),
  param_cancel: async () => wasmParamCancel(),
  param_write: async ({ name, value }) => wasmParamWrite(name, value),
  param_write_batch: async ({ params }) => wasmParamWriteBatch(params),
  param_staging_snapshot: async () => wasmParamStagingSnapshot(),
  param_stage: async ({ changes, expectedRevision }) => wasmParamStage(changes, expectedRevision),
  param_discard_staged: async ({ names, expectedRevision }) => wasmParamDiscardStaged(names, expectedRevision),
  param_clear_staged: async ({ expectedRevision }) => wasmParamClearStaged(expectedRevision),
  param_apply_staged: async ({ names, expectedRevision }) => wasmParamApplyStaged(names, expectedRevision),
  param_reset_reboot_checkpoint: async () => wasmParamResetRebootCheckpoint(),
  param_parse_file: async ({ contents }) => wasmParamParseFile(contents),
  param_format_file: async ({ store }) => wasmParamFormatFile(store),
});
