// ---------------------------------------------------------------------------
// Motor layout data & lookup helpers
// Source: MissionPlanner APMotorLayout.json (AP_Motors library test ver 1.2)
// ---------------------------------------------------------------------------

import rawData from "./motor-layouts.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalised motor entry for a single motor in a frame layout. */
export type MotorLayout = {
  /** Motor number (1-based, matches ArduPilot SERVOx_FUNCTION output numbering). */
  motorNumber: number;
  /** Roll mixing factor. Negative = left, positive = right. */
  rollFactor: number;
  /** Pitch mixing factor. Positive = forward, negative = backward. */
  pitchFactor: number;
  /** Yaw mixing factor. +1 = CW, -1 = CCW, 0 = unknown/tilt. */
  yawFactor: number;
  /** Motor test order (1-based sequential). */
  testOrder: number;
};

/** A complete frame layout: frame class + type → motor list. */
export type FrameLayout = {
  frameClass: number;
  frameType: number;
  /** Human-readable class name (e.g. "QUAD", "HEXA"). */
  className: string;
  /** Human-readable type name (e.g. "X", "PLUS", "H"). */
  typeName: string;
  motors: MotorLayout[];
};

// ---------------------------------------------------------------------------
// Raw JSON shape
// ---------------------------------------------------------------------------

type RawMotor = {
  Number: number;
  TestOrder: number;
  Rotation: string;
  Roll: number;
  Pitch: number;
};

type RawLayout = {
  Class: number;
  ClassName: string;
  Type: number;
  TypeName: string;
  motors: RawMotor[];
};

type RawFile = {
  Version: string;
  layouts: RawLayout[];
};

// ---------------------------------------------------------------------------
// Rotation string → yaw factor
// ---------------------------------------------------------------------------

function rotationToYaw(rotation: string): number {
  switch (rotation) {
    case "CW":
      return 1;
    case "CCW":
      return -1;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Indexed lookup map  (built once at import time)
// ---------------------------------------------------------------------------

function buildIndex(data: RawFile): Map<string, FrameLayout> {
  const map = new Map<string, FrameLayout>();
  for (const entry of data.layouts) {
    const key = `${entry.Class}:${entry.Type}`;
    map.set(key, {
      frameClass: entry.Class,
      frameType: entry.Type,
      className: entry.ClassName,
      typeName: entry.TypeName,
      motors: entry.motors.map((m) => ({
        motorNumber: m.Number,
        rollFactor: m.Roll,
        pitchFactor: m.Pitch,
        yawFactor: rotationToYaw(m.Rotation),
        testOrder: m.TestOrder,
      })),
    });
  }
  return map;
}

const layoutIndex = buildIndex(rawData as RawFile);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up a motor layout by FRAME_CLASS and FRAME_TYPE parameter values.
 * Returns `null` for unknown combinations.
 */
export function getMotorLayout(frameClass: number, frameType: number): FrameLayout | null {
  return layoutIndex.get(`${frameClass}:${frameType}`) ?? null;
}

/**
 * Convenience: motor count for a given frame class + type.
 * Returns 0 for unknown combinations.
 */
export function getMotorCount(frameClass: number, frameType: number): number {
  return layoutIndex.get(`${frameClass}:${frameType}`)?.motors.length ?? 0;
}

/**
 * All available layouts (for iteration / dropdowns).
 */
export function getAllLayouts(): FrameLayout[] {
  return Array.from(layoutIndex.values());
}
