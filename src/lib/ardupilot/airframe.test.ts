import { describe, expect, it } from "vitest";
import rawCatalog from "../../data/motor-layouts.json";
import { getMotorLayout } from "../../data/motor-layouts";
import { FRAME_TYPES, FrameClass, FrameType, isAirframe, TailsitterMode, TiltType } from "../airframe";
import {
  decodeArduPilotFrame,
  decodeArduPilotFrameClass,
  encodeArduPilotFrame,
  encodeArduPilotFrameClass,
  decodeArduPilotTiltType,
  encodeArduPilotTiltType,
  decodeArduPilotTailsitterMode,
} from "./airframe";

// These numeric fixtures are wire contracts from AP_Motors_Class.h, not UI values.
describe("ArduPilot airframe boundary", () => {
  it.each([
    [0, FrameClass.Undefined],
    [1, FrameClass.Quad],
    [2, FrameClass.Hexa],
    [3, FrameClass.Octa],
    [4, FrameClass.OctaQuad],
    [5, FrameClass.Y6],
    [6, FrameClass.Heli],
    [7, FrameClass.Tri],
    [8, FrameClass.Single],
    [9, FrameClass.Coax],
    [10, FrameClass.SingleDual],
    [11, FrameClass.HeliDual],
    [12, FrameClass.DodecaHexa],
    [13, FrameClass.HeliQuad],
    [14, FrameClass.Deca],
    [15, FrameClass.ScriptingMatrix],
    [16, FrameClass.Scripting6Dof],
    [17, FrameClass.DynamicScriptingMatrix],
  ] as const)("maps class %i to %s in both directions", (code, frameClass) => {
    expect(decodeArduPilotFrameClass(code)).toBe(frameClass);
    expect(encodeArduPilotFrameClass(frameClass)).toBe(code);
  });

  it("round-trips every valid domain frame and rejects invalid class/layout pairs", () => {
    for (const frameClass of Object.values(FrameClass)) {
      for (const frameType of Object.values(FrameType)) {
        const candidate = { frameClass, frameType };
        const allowed: readonly FrameType[] = FRAME_TYPES[frameClass];
        expect(isAirframe(candidate)).toBe(allowed.includes(frameType));
        if (!isAirframe(candidate)) continue;
        const codes = encodeArduPilotFrame(candidate);
        expect(decodeArduPilotFrame(codes.frameClass, codes.frameType).frame).toEqual(candidate);
      }
    }
  });

  it("interprets the same firmware type in its class context", () => {
    expect(decodeArduPilotFrame(1, 6).frame).toEqual({
      frameClass: FrameClass.Quad,
      frameType: FrameType.PlusReversed,
    });
    expect(decodeArduPilotFrame(7, 6).frame).toEqual({
      frameClass: FrameClass.Tri,
      frameType: FrameType.TriPitchReversed,
    });
    expect(decodeArduPilotFrame(5, 10).frame).toEqual({ frameClass: FrameClass.Y6, frameType: FrameType.Y6B });
    expect(decodeArduPilotFrame(5, 11).frame).toEqual({ frameClass: FrameClass.Y6, frameType: FrameType.Y6Firefly });
  });

  it.each([0, 1, 2, 7, 18, 123, 255])("normalizes ignored Tri/Y6 type %i without overwriting its raw value", (code) => {
    for (const [frameClass, frameType] of [
      [7, FrameType.TriStandard],
      [5, FrameType.Y6A],
    ] as const) {
      const decoded = decodeArduPilotFrame(frameClass, code);
      expect(decoded).toMatchObject({
        status: "known",
        frame: { frameType },
        parameters: { frameClass, frameType: code },
      });
    }
  });

  it("canonicalizes Deca X aliases and decodes all raw catalog entries", () => {
    expect(decodeArduPilotFrame(14, 14).frame).toEqual(decodeArduPilotFrame(14, 1).frame);
    expect(rawCatalog.layouts).toHaveLength(75);
    for (const raw of rawCatalog.layouts) {
      const decoded = decodeArduPilotFrame(raw.Class, raw.Type);
      expect(decoded.status).toBe("known");
      expect(getMotorLayout(decoded.frame)).not.toBeNull();
    }
  });

  it.each([
    [99, 1],
    [1, 99],
    [1, 10],
    [2, 4],
    [7, -1],
    [7, 256],
    [7, 1.5],
    [1, NaN],
    [Infinity, 0],
  ])("preserves unsupported frame codes %s/%s instead of guessing", (frameClass, frameType) => {
    const decoded = decodeArduPilotFrame(frameClass, frameType);
    expect(decoded.status).toBe("unsupported");
    expect(decoded.frame).toBeNull();
    expect(decoded.parameters).toEqual({ frameClass, frameType });
    expect(getMotorLayout(decoded.frame)).toBeNull();
  });

  it.each([
    [null, null],
    [1, null],
    [null, 1],
  ])("keeps missing parameters explicit", (frameClass, frameType) => {
    expect(decodeArduPilotFrame(frameClass, frameType)).toMatchObject({ status: "incomplete", frame: null });
  });

  it("distinguishes a known firmware frame from available diagram geometry", () => {
    const decoded = decodeArduPilotFrame(1, 19);
    expect(decoded.frame?.frameType).toBe(FrameType.Y4);
    expect(getMotorLayout(decoded.frame)).toBeNull();
  });

  it.each([
    [0, TiltType.Continuous],
    [1, TiltType.Binary],
    [2, TiltType.VectoredYaw],
    [3, TiltType.Bicopter],
  ] as const)("maps tilt type %i to %s", (code, type) => {
    expect(decodeArduPilotTiltType(code)).toBe(type);
    expect(encodeArduPilotTiltType(type)).toBe(code);
  });

  it("does not coerce unknown or missing tilt/tailsitter modes to a known mechanism", () => {
    for (const code of [null, -1, 4, 1.5, NaN, Infinity]) expect(decodeArduPilotTiltType(code)).toBeNull();
    expect(decodeArduPilotTailsitterMode(0)).toBe(TailsitterMode.Disabled);
    expect(decodeArduPilotTailsitterMode(1)).toBe(TailsitterMode.Enabled);
    expect(decodeArduPilotTailsitterMode(2)).toBe(TailsitterMode.MotorOnly);
    expect(decodeArduPilotTailsitterMode(3)).toBeNull();
  });
});
