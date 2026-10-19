import {
  wasmFenceClear,
  wasmFenceDownload,
  wasmFenceUpload,
  wasmMissionCancel,
  wasmMissionClear,
  wasmMissionDownload,
  wasmMissionSetCurrent,
  wasmMissionUpload,
  wasmMissionValidate,
  wasmMissionCommandsDecode,
  wasmMissionCommandsEncode,
  wasmRallyClear,
  wasmRallyDownload,
  wasmRallyUpload,
} from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";

export const missionCommandHandlers = definePlatformCommandHandlers({
  mission_commands_decode: ({ commands }) => wasmMissionCommandsDecode(commands),
  mission_commands_encode: ({ commands }) => wasmMissionCommandsEncode(commands),
  mission_validate: async ({ plan }) => wasmMissionValidate(plan),
  mission_upload: async ({ plan }) => wasmMissionUpload(plan),
  mission_download: async () => wasmMissionDownload(),
  mission_clear: async () => wasmMissionClear(),
  mission_set_current: async ({ seq }) => wasmMissionSetCurrent(seq),
  mission_cancel: async () => wasmMissionCancel(),
  fence_upload: async ({ plan }) => wasmFenceUpload(plan),
  fence_download: async () => wasmFenceDownload(),
  fence_clear: async () => wasmFenceClear(),
  rally_upload: async ({ plan }) => wasmRallyUpload(plan),
  rally_download: async () => wasmRallyDownload(),
  rally_clear: async () => wasmRallyClear(),
});
