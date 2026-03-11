// Board/sensor values: MissionPlanner ConfigBatteryMonitoring.cs
// Calculator formulas: MissionPlanner ConfigInitialParams.cs:89-121
// Battery chemistry defaults: ConfigInitialParams.cs:236-260

export type BoardPreset = {
  label: string;
  voltPin: number;
  currPin: number;
};

export type SensorPreset = {
  label: string;
  voltMult: number;
  ampPerVolt: number;
};

export type BatteryChemistry = {
  label: string;
  cellVoltMax: number;
  cellVoltMin: number;
};

// BATT_VOLT_PIN / BATT_CURR_PIN per board
// Source: ConfigBatteryMonitoring.cs CMB_apmversion_SelectedIndexChanged
export const BOARD_PRESETS: BoardPreset[] = [
  { label: "APM 1", voltPin: 0, currPin: 1 },
  { label: "APM 2", voltPin: 1, currPin: 2 },
  { label: "APM 2.5", voltPin: 13, currPin: 12 },
  { label: "PX4", voltPin: 100, currPin: 101 },
  { label: "Pixhawk / Cube", voltPin: 2, currPin: 3 },
  { label: "VRBrain 5", voltPin: 10, currPin: 11 },
  { label: "VR Micro Brain 5", voltPin: 10, currPin: -1 },
  { label: "VRBrain 4", voltPin: 6, currPin: 7 },
  { label: "CubeOrange", voltPin: 14, currPin: 15 },
  { label: "Durandal", voltPin: 16, currPin: 17 },
  { label: "Pixhawk 6X / 6C", voltPin: 8, currPin: 4 },
];

// BATT_VOLT_MULT / BATT_AMP_PERVLT per power module
// Source: ConfigBatteryMonitoring.cs CMB_batmonsensortype_SelectedIndexChanged
// AttoPilot values computed: voltMult = maxvolt / (maxvolt * mvpervolt / 1000)
//                            ampPerVolt = maxamps / (maxamps * mvperamp / 1000)
export const SENSOR_PRESETS: SensorPreset[] = [
  { label: "AttoPilot 45A", voltMult: 4.127115, ampPerVolt: 13.6612 },
  { label: "AttoPilot 90A", voltMult: 15.70105, ampPerVolt: 27.3224 },
  { label: "AttoPilot 180A", voltMult: 15.70105, ampPerVolt: 54.64481 },
  { label: "Power Module (3DR IV)", voltMult: 10.10101, ampPerVolt: 18.0018 },
  { label: "3DR 4-in-1 ESC", voltMult: 12.02, ampPerVolt: 17 },
  { label: "HV 3DR APM", voltMult: 12.02, ampPerVolt: 24 },
  { label: "HV 3DR PX4/Cube", voltMult: 12.02, ampPerVolt: 39.877 },
  { label: "Pixhack", voltMult: 18, ampPerVolt: 24 },
  { label: "Holybro Pixhawk4", voltMult: 18.182, ampPerVolt: 36.364 },
  { label: "Power Module (3DR)", voltMult: 10.1, ampPerVolt: 17.0 },
];

export const BATTERY_CHEMISTRIES: BatteryChemistry[] = [
  { label: "LiPo", cellVoltMax: 4.2, cellVoltMin: 3.3 },
  { label: "LiPo HV", cellVoltMax: 4.35, cellVoltMin: 3.3 },
  { label: "LiIon", cellVoltMax: 4.1, cellVoltMin: 2.8 },
];

// Battery voltage formulas — ConfigInitialParams.cs:115-119

/** BATT_ARM_VOLT = (cells - 1) * 0.1 + (cellVoltMin + 0.3) * cells */
export function calcBattArmVolt(cells: number, cellVoltMin: number): number {
  return (cells - 1) * 0.1 + (cellVoltMin + 0.3) * cells;
}

/** BATT_LOW_VOLT = (cellVoltMin + 0.3) * cells */
export function calcBattLowVolt(cells: number, cellVoltMin: number): number {
  return (cellVoltMin + 0.3) * cells;
}

/** BATT_CRT_VOLT = (cellVoltMin + 0.2) * cells */
export function calcBattCrtVolt(cells: number, cellVoltMin: number): number {
  return (cellVoltMin + 0.2) * cells;
}

/** MOT_BAT_VOLT_MAX = cellVoltMax * cells */
export function calcBattVoltMax(cells: number, cellVoltMax: number): number {
  return cellVoltMax * cells;
}

/** MOT_BAT_VOLT_MIN = cellVoltMin * cells */
export function calcBattVoltMin(cells: number, cellVoltMin: number): number {
  return cellVoltMin * cells;
}

// Initial parameter calculator — ConfigInitialParams.cs:89-113

/** min(round(0.15686 * ln(propInches) + 0.23693, 2), 0.80) — 9" prop → 0.58 */
export function calcMotThrustExpo(propInches: number): number {
  return Math.min(
    Math.round((0.15686 * Math.log(propInches) + 0.23693) * 100) / 100,
    0.8,
  );
}

/** max(20, round(289.22 * propInches^(-0.838))) — 9" prop → 46 */
export function calcGyroFilter(propInches: number): number {
  return Math.max(20, Math.round(289.22 * Math.pow(propInches, -0.838)));
}

/** Fixed constant, NOT derived from gyro filter */
export const INS_ACCEL_FILTER = 10;

/** max(10, gyroFilter / 2) — used for PIT/RLL FLTD and FLTT */
export function calcRateFilterD(gyroFilter: number): number {
  return Math.max(10, gyroFilter / 2);
}

export const ATC_RAT_PIT_FLTE = 0;
export const ATC_RAT_RLL_FLTE = 0;
export const ATC_RAT_YAW_FLTD = 0;
export const ATC_RAT_YAW_FLTE = 2;

/** max(10, gyroFilter / 2) */
export function calcYawFilterT(gyroFilter: number): number {
  return Math.max(10, gyroFilter / 2);
}

/** max(8000, roundTo(-900 * prop + 36000, -2)) */
export function calcAccelYMax(propInches: number): number {
  return Math.max(8000, roundTo(-900 * propInches + 36000, -2));
}

/** max(10000, roundTo(poly(prop), -2)) where poly = -2.613267*p^3 + 343.39216*p^2 - 15083.7121*p + 235771 */
export function calcAccelPRMax(propInches: number): number {
  const raw =
    -2.613267 * Math.pow(propInches, 3) +
    343.39216 * Math.pow(propInches, 2) -
    15083.7121 * propInches +
    235771;
  return Math.max(10000, roundTo(raw, -2));
}

/** 0.5 * accelYMax / 4500 */
export function calcAcroYawP(accelYMax: number): number {
  return (0.5 * accelYMax) / 4500;
}

export const MOT_THST_HOVER = 0.2;
export const ATC_THR_MIX_MAN = 0.1;

// MissionPlanner-style RoundTo: roundTo(v, -2) rounds to nearest 100
function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, -digits);
  return Math.round(value / factor) * factor;
}
