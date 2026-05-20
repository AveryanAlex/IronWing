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
  wasmRallyClear,
  wasmRallyDownload,
  wasmRallyUpload,
} from "../wasm";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { FencePlan, MissionPlan, RallyPlan } from "../../../mission";

export async function tryHandleMissionCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "mission_validate":
      return handled(await wasmMissionValidate(planArg<MissionPlan>(args, "mission_validate.plan")));
    case "mission_upload":
      return handled(await wasmMissionUpload(planArg<MissionPlan>(args, "mission_upload.plan")));
    case "mission_download":
      return handled(await wasmMissionDownload());
    case "mission_clear":
      return handled(await wasmMissionClear());
    case "mission_set_current":
      return handled(await wasmMissionSetCurrent(missionSetCurrentSeq(args)));
    case "mission_cancel":
      return handled(await wasmMissionCancel());
    case "fence_upload":
      return handled(await wasmFenceUpload(planArg<FencePlan>(args, "fence_upload.plan")));
    case "fence_download":
      return handled(await wasmFenceDownload());
    case "fence_clear":
      return handled(await wasmFenceClear());
    case "rally_upload":
      return handled(await wasmRallyUpload(planArg<RallyPlan>(args, "rally_upload.plan")));
    case "rally_download":
      return handled(await wasmRallyDownload());
    case "rally_clear":
      return handled(await wasmRallyClear());
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

function planArg<T>(args: WebCommandArgs, label: string): T {
  if (!args?.plan || typeof args.plan !== "object" || Array.isArray(args.plan)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return args.plan as T;
}

function missionSetCurrentSeq(args: WebCommandArgs): number {
  if (typeof args?.seq !== "number" || !Number.isInteger(args.seq) || args.seq < 0) {
    throw new Error("missing or invalid mission_set_current.seq");
  }

  return args.seq;
}
