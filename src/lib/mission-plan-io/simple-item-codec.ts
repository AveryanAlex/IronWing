import { typedInvoke } from "../ipc/client";
import type { MissionCommand as SdkCommand, RawMissionCommand as SdkRawCommand } from "../generated/mavkit-json";
import type { MissionItem, MissionFrame, MissionCommand } from "../mavkit-types";
import { MAV_FRAME_GLOBAL, MAV_FRAME_GLOBAL_RELATIVE_ALT, MAV_FRAME_GLOBAL_TERRAIN_ALT, MAV_FRAME_MISSION, type QgcSimpleItem } from "./qgc-types";

type QgcParams = [number, number, number, number, number, number, number];
function normalizeParams(values: unknown): QgcParams {
  const params = Array.isArray(values) ? values : [];
  return Array.from({ length: 7 }, (_, index) => typeof params[index] === "number" && Number.isFinite(params[index]) ? params[index] : 0) as QgcParams;
}
function numberOrZero(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

// Each synchronous run of item conversions becomes one SDK IPC call, including
// embedded survey items. Large plans do not issue one native round trip per item.
function batchCodec<Input, Output>(convert: (inputs: Input[]) => Promise<Output[]>) {
  let pending: { input: Input; resolve: (output: Output) => void; reject: (error: unknown) => void }[] = [];
  return (input: Input): Promise<Output> => new Promise((resolve, reject) => {
    pending.push({ input, resolve, reject });
    if (pending.length !== 1) return;
    queueMicrotask(() => {
      const batch = pending;
      pending = [];
      void Promise.resolve().then(() => convert(batch.map((request) => request.input))).then((outputs) => {
        if (outputs.length !== batch.length) throw new Error("Mission codec returned an incomplete batch.");
        batch.forEach((request, index) => request.resolve(outputs[index]));
      }).catch((error) => batch.forEach((request) => request.reject(error)));
    });
  });
}
const decode = batchCodec<SdkRawCommand, SdkCommand>((commands) => typedInvoke("mission_commands_decode", { commands }));
const encode = batchCodec<SdkCommand, SdkRawCommand>((commands) => typedInvoke("mission_commands_encode", { commands }));

export function missionFrameFromNumeric(frame: number): MissionFrame {
    switch (frame) {
        case MAV_FRAME_GLOBAL:
            return "global";
        case MAV_FRAME_GLOBAL_RELATIVE_ALT:
            return "global_relative_alt";
        case MAV_FRAME_GLOBAL_TERRAIN_ALT:
            return "global_terrain_alt";
        case MAV_FRAME_MISSION:
            return "mission";
        default:
            return { other: frame };
    }
}

export function missionFrameToNumeric(frame: MissionFrame): number {
    if (frame === "global") return MAV_FRAME_GLOBAL;
    if (frame === "global_relative_alt") return MAV_FRAME_GLOBAL_RELATIVE_ALT;
    if (frame === "global_terrain_alt") return MAV_FRAME_GLOBAL_TERRAIN_ALT;
    if (frame === "mission") return MAV_FRAME_MISSION;
    return frame.other;
}

function qgcRawCoordinatesToWire(frame: MissionFrame, params: QgcParams): { x: number; y: number } | null {
    if (typeof frame !== "string") return null;
    const toWire = (value: number) => frame === "mission" ? value : Math.round(value * 1e7);
    const x = toWire(params[4]);
    const y = toWire(params[5]);
    return [x, y].every((value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff)
        ? { x, y } : null;
}


export async function parseSimpleItem(item: QgcSimpleItem, index: number, warnings: string[], label = `Mission item ${index + 1}`): Promise<MissionItem> {
  const params = normalizeParams(item.params);
  const frame = missionFrameFromNumeric(numberOrZero(item.frame));
  const coordinates = qgcRawCoordinatesToWire(frame, params);
  if (!coordinates || !Number.isInteger(item.command) || item.command < 0 || item.command > 65535
    || !Number.isInteger(item.frame ?? 0) || (item.frame ?? 0) < 0 || (item.frame ?? 0) > 255
    || item.params?.some((value) => value === null || !Number.isFinite(value))) {
    warnings.push(`${label} (MAV_CMD ${item.command}) preserved as file-only QGC content because its frame or coordinates cannot be represented safely for upload.`);
    return { command: { QgcPassthrough: structuredClone(item) }, current: index === 0, autocontinue: item.autoContinue ?? true };
  }
  const command = await decode({ command: item.command, frame, param1: params[0], param2: params[1], param3: params[2], param4: params[3], ...coordinates, z: params[6] });
  if ("Other" in command) warnings.push(`${label} (MAV_CMD ${item.command}) contains an unknown command, unsupported enum, frame or extra wire values; imported as Other without changing its parameters or frame.`);
  return { command: command as MissionCommand, current: index === 0, autocontinue: item.autoContinue ?? true };
}

export async function exportMissionItem(item: MissionItem, index: number, _warnings: string[]): Promise<QgcSimpleItem> {
  if ("QgcPassthrough" in item.command) return { ...structuredClone(item.command.QgcPassthrough), doJumpId: index + 1, autoContinue: item.autocontinue };
  const raw = await encode(item.command);
  const scale = raw.frame === "global" || raw.frame === "global_relative_alt" || raw.frame === "global_terrain_alt" ? 1e7 : 1;
  return {
    type: "SimpleItem", autoContinue: item.autocontinue, command: raw.command, doJumpId: index + 1,
    frame: missionFrameToNumeric(raw.frame),
    params: [raw.param1, raw.param2, raw.param3, raw.param4, raw.x / scale, raw.y / scale, raw.z],
  };
}
