export type PrearmBlocker = {
  id: string;
  category: string;
  rawText: string;
  guidance: string;
};

export const PREARM_PATTERNS: { pattern: RegExp; category: string; guidance: string }[] = [
  { pattern: /gps/i, category: "GPS", guidance: "Ensure GPS has clear sky view. Wait for 3D fix and >6 satellites." },
  { pattern: /ahrs|ekf/i, category: "EKF", guidance: "Wait for EKF to converge. May take 30-60 seconds after boot." },
  { pattern: /compass|mag/i, category: "Compass", guidance: "Run compass calibration in the Calibration section." },
  { pattern: /accel|ins/i, category: "IMU", guidance: "Run accelerometer calibration in the Calibration section." },
  { pattern: /rc|throttle/i, category: "RC", guidance: "Calibrate radio in the RC / Receiver section." },
  { pattern: /batt/i, category: "Battery", guidance: "Check battery connection and voltage." },
  { pattern: /safety/i, category: "Safety", guidance: "Press the hardware safety switch on the flight controller." },
  { pattern: /baro/i, category: "Baro", guidance: "Check barometer hardware. May need power cycle." },
  { pattern: /board|internal/i, category: "Hardware", guidance: "Check flight controller hardware." },
  { pattern: /log/i, category: "Logging", guidance: "Check SD card is inserted and functional." },
];

export function classifyPrearm(text: string, ts: number): PrearmBlocker {
  const stripped = text.replace(/^pre-?arm:\s*/i, "").trim();
  for (const { pattern, category, guidance } of PREARM_PATTERNS) {
    if (pattern.test(stripped)) {
      return { id: `${category}-${ts}`, category, rawText: text, guidance };
    }
  }
  return {
    id: `unknown-${ts}`,
    category: "Other",
    rawText: text,
    guidance: "Check ArduPilot documentation for this pre-arm failure.",
  };
}

export function categoryIcon(category: string) {
  switch (category) {
    case "GPS": return "\u{1F6F0}";
    case "EKF": return "\u{1F4D0}";
    case "Compass": return "\u{1F9ED}";
    case "IMU": return "\u2696\uFE0F";
    case "RC": return "\u{1F4E1}";
    case "Battery": return "\u{1F50B}";
    case "Safety": return "\u{1F512}";
    case "Baro": return "\u{1F321}";
    case "Hardware": return "\u{1F527}";
    case "Logging": return "\u{1F4BE}";
    default: return "\u26A0\uFE0F";
  }
}
