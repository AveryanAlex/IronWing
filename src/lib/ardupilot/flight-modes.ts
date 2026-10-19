// Wire values from ArduCopter/mode.h, ArduPlane/mode.h and Rover/mode.h.
export enum CopterFlightMode {
  Stabilize = 0,
  AltHold = 2,
  Auto = 3,
  Loiter = 5,
  Rtl = 6,
  Land = 9,
}
export enum PlaneFlightMode {
  Manual = 0,
  FbwA = 5,
  FbwB = 6,
  Auto = 10,
  Rtl = 11,
  Loiter = 12,
  QStabilize = 17,
  QHover = 18,
  QLoiter = 19,
  QLand = 20,
  QRtl = 21,
  QAutotune = 22,
  QAcro = 23,
  LoiterAltQLand = 25,
}
export enum RoverFlightMode {
  Manual = 0,
  Hold = 4,
  Loiter = 5,
  Auto = 10,
  Rtl = 11,
  Guided = 15,
}
export type FlightModePreset = "copter" | "plane" | "rover";
type FamilyMode = { copter: CopterFlightMode; plane: PlaneFlightMode; rover: RoverFlightMode };
type Mode<T> = { value: T; label: string };
type SixModes<T> = readonly [Mode<T>, Mode<T>, Mode<T>, Mode<T>, Mode<T>, Mode<T>];
export const RECOMMENDED_FLIGHT_MODE_PRESETS = {
  copter: [
    { value: CopterFlightMode.Stabilize, label: "Stabilize" },
    { value: CopterFlightMode.AltHold, label: "AltHold" },
    { value: CopterFlightMode.Loiter, label: "Loiter" },
    { value: CopterFlightMode.Rtl, label: "RTL" },
    { value: CopterFlightMode.Land, label: "Land" },
    { value: CopterFlightMode.Auto, label: "Auto" },
  ],
  plane: [
    { value: PlaneFlightMode.Manual, label: "Manual" },
    { value: PlaneFlightMode.FbwA, label: "FBW-A" },
    { value: PlaneFlightMode.FbwB, label: "FBW-B" },
    { value: PlaneFlightMode.Rtl, label: "RTL" },
    { value: PlaneFlightMode.Loiter, label: "Loiter" },
    { value: PlaneFlightMode.Auto, label: "Auto" },
  ],
  rover: [
    { value: RoverFlightMode.Manual, label: "Manual" },
    { value: RoverFlightMode.Hold, label: "Hold" },
    { value: RoverFlightMode.Rtl, label: "RTL" },
    { value: RoverFlightMode.Loiter, label: "Loiter" },
    { value: RoverFlightMode.Auto, label: "Auto" },
    { value: RoverFlightMode.Guided, label: "Guided" },
  ],
} satisfies { [F in FlightModePreset]: SixModes<FamilyMode[F]> };
const QUADPLANE_MODES: ReadonlySet<number> = new Set([
  PlaneFlightMode.QStabilize,
  PlaneFlightMode.QHover,
  PlaneFlightMode.QLoiter,
  PlaneFlightMode.QLand,
  PlaneFlightMode.QRtl,
  PlaneFlightMode.QAutotune,
  PlaneFlightMode.QAcro,
  PlaneFlightMode.LoiterAltQLand,
]);
export function isQuadPlaneFlightMode(value: number): boolean {
  return QUADPLANE_MODES.has(value);
}
