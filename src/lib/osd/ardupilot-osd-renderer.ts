import type { ParamStore } from "../../params";
import type { HomePosition, Telemetry, VehicleState } from "../../telemetry";
import type { StagedParameterEdit } from "../stores/params";
import type { OsdGridModel } from "./ardupilot-osd-model";

export const SNEAKY_FPV_ARDU_WS_ATLAS = {
  src: "/osd/fonts/WS_ARDU_SNEAKY_FPV_36.png",
  glyphWidthPx: 36,
  glyphHeightPx: 54,
  glyphCount: 256,
} as const;

export const KNOWN_ARDUPILOT_OSD_ITEM_KEYS = [
  "SIDEBARS",
  "MESSAGE",
  "HORIZON",
  "COMPASS",
  "ALTITUDE",
  "TER_HGT",
  "RNGF",
  "WAYPOINT",
  "XTRACK",
  "BAT_VOLT",
  "BAT2_VLT",
  "AVGCELLV",
  "ACRVOLT",
  "RESTVOLT",
  "RSSI",
  "LINK_Q",
  "CURRENT",
  "BATUSED",
  "BAT2USED",
  "SATS",
  "FLTMODE",
  "GSPEED",
  "ASPEED",
  "ASPD1",
  "ASPD2",
  "VSPEED",
  "THROTTLE",
  "HEADING",
  "WIND",
  "HOME",
  "RPM",
  "FENCE",
  "ROLL",
  "PITCH",
  "TEMP",
  "BTEMP",
  "ATEMP",
  "HDOP",
  "FLTIME",
  "CLK",
  "VTX_PWR",
  "ESCTEMP",
  "ESCRPM",
  "ESCAMPS",
  "GPSLAT",
  "GPSLONG",
  "PLUSCODE",
  "DIST",
  "STATS",
  "CLIMBEFF",
  "EFF",
  "CALLSIGN",
  "CURRENT2",
  "RC_PWR",
  "RSSIDBM",
  "RC_SNR",
  "RC_ANT",
  "RC_LQ",
  "CRSSHAIR",
  "HOMEDIST",
  "HOMEDIR",
  "POWER",
  "CELLVOLT",
  "BATTBAR",
  "ARMING",
] as const;

export type KnownArduPilotOsdItemKey = (typeof KNOWN_ARDUPILOT_OSD_ITEM_KEYS)[number];
export type OsdRenderFidelity = "live" | "partial";

export type OsdFootprint = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type OsdGlyphWrite = {
  x: number;
  y: number;
  glyph: number;
  hidden: boolean;
};

export type OsdItemRender = {
  key: string;
  glyphs: OsdGlyphWrite[];
  currentFootprint: OsdFootprint;
  maxFootprint: OsdFootprint;
  fidelity: OsdRenderFidelity;
};

export type OsdRenderContext = {
  telemetry: Telemetry;
  vehicleState: VehicleState | null;
  homePosition: HomePosition | null;
  statusMessage: string | null;
  connected: boolean;
  paramValues: Readonly<Record<string, number | null | undefined>>;
  nowMs: number;
};

export type OsdRenderSource = Omit<OsdRenderContext, "nowMs">;

export type OsdRenderPlacement = {
  key: string;
  x: number;
  y: number;
};

export type OsdScreenGlyph = {
  x: number;
  y: number;
  glyph: number;
  ownerKey: string;
};

export type OsdScreenRender = {
  glyphs: OsdScreenGlyph[];
  items: Map<string, OsdItemRender>;
  partialItemKeys: string[];
};

type UnitKind = "altitude" | "speed" | "vspeed" | "distance" | "distance_long" | "temperature";
type Token = number;

const SYMBOL = {
  M: 0xb9,
  KM: 0xba,
  FT: 0x0f,
  MI: 0xbb,
  ALT_M: 0xb1,
  ALT_FT: 0xb3,
  BATT_FULL: 0x90,
  BATT_UNKNOWN: 0x97,
  RSSI: 0x01,
  VOLT: 0x06,
  AMP: 0x9a,
  MAH: 0x07,
  MS: 0x9f,
  FS: 0x99,
  KMH: 0xa1,
  MPH: 0xb0,
  DEGR: 0xa8,
  PCNT: 0x25,
  RPM: 0xe0,
  ASPD: 0xe1,
  GSPD: 0xe2,
  WSPD: 0xe3,
  VSPD: 0xe4,
  WPNO: 0xe5,
  FTMIN: 0xe8,
  SAT_L: 0x1e,
  SAT_R: 0x1f,
  HDOP_L: 0xbd,
  HDOP_R: 0xbe,
  HOME: 0xbf,
  WIND: 0x16,
  ARROW_START: 0x60,
  AH_H_START: 0x80,
  AH_V_START: 0xca,
  AH_CENTER_LINE_LEFT: 0x26,
  AH_CENTER_LINE_RIGHT: 0x27,
  AH_CENTER: 0x7e,
  HEADING_N: 0x18,
  HEADING_S: 0x19,
  HEADING_E: 0x1a,
  HEADING_W: 0x1b,
  HEADING_DIVIDED_LINE: 0x1c,
  HEADING_LINE: 0x1d,
  UP_UP: 0xa2,
  UP: 0xa3,
  DOWN: 0xa4,
  DOWN_DOWN: 0xa5,
  DEGREES_C: 0x0e,
  DEGREES_F: 0x0d,
  GPS_LAT: 0xa6,
  GPS_LONG: 0xa7,
  ARMED: 0x00,
  DISARMED: 0xe9,
  ROLL0: 0x2d,
  ROLLR: 0xea,
  ROLLL: 0xeb,
  PTCH0: 0x7c,
  PTCHUP: 0xec,
  PTCHDWN: 0xed,
  XERR: 0xee,
  KN: 0xf0,
  NM: 0xf1,
  DIST: 0x22,
  FLY: 0x9c,
  EFF: 0xf2,
  AH: 0xf3,
  MW: 0xf4,
  CLK: 0xbc,
  KILO: 0x4b,
  TERALT: 0xef,
  FENCE_ENABLED: 0xf5,
  FENCE_DISABLED: 0xf6,
  RNGFD: 0xf7,
  LQ: 0xf8,
  WATT: 0xae,
  WH: 0xab,
  DB: 0xf9,
  DBM: 0xfa,
  SNR: 0xfb,
  ANT: 0xfc,
  SIDEBAR_R_ARROW: 0x09,
  SIDEBAR_L_ARROW: 0x0a,
  SIDEBAR_A: 0x13,
  SIDEBAR_B: 0x14,
  SIDEBAR_C: 0x15,
  SIDEBAR_D: 0xdd,
  SIDEBAR_E: 0xdb,
  SIDEBAR_F: 0xdc,
  SIDEBAR_G: 0xda,
  SIDEBAR_H: 0xde,
  SIDEBAR_I: 0x11,
  SIDEBAR_J: 0x12,
} as const;

const DEFAULT_CONTEXT: OsdRenderContext = {
  telemetry: {},
  vehicleState: null,
  homePosition: null,
  statusMessage: null,
  connected: false,
  paramValues: {},
  nowMs: 0,
};

const KNOWN_KEY_SET = new Set<string>(KNOWN_ARDUPILOT_OSD_ITEM_KEYS);

export function createOsdRenderContext(input: Partial<OsdRenderContext> = {}): OsdRenderContext {
  return {
    ...DEFAULT_CONTEXT,
    ...input,
    telemetry: input.telemetry ?? {},
    paramValues: input.paramValues ?? {},
  };
}

export function buildEffectiveOsdParamValues(
  paramStore: ParamStore | null,
  stagedEdits: Record<string, Pick<StagedParameterEdit, "nextValue"> | undefined> = {},
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const [name, param] of Object.entries(paramStore?.params ?? {})) {
    if (typeof param.value === "number" && Number.isFinite(param.value)) {
      values[name] = param.value;
    }
  }
  for (const [name, edit] of Object.entries(stagedEdits)) {
    if (typeof edit?.nextValue === "number" && Number.isFinite(edit.nextValue)) {
      values[name] = edit.nextValue;
    }
  }
  return values;
}

export function renderArduPilotOsdItem(key: string, context: OsdRenderContext): OsdItemRender {
  const normalizedKey = key.trim().toUpperCase();
  const builder = new PanelBuilder(normalizedKey, context);
  renderKnownPanel(builder, normalizedKey, context);
  const glyphs = builder.finish();
  const currentFootprint = footprintForGlyphs(glyphs);
  const maxFootprint = maximumFootprint(normalizedKey, context, currentFootprint);
  return {
    key: normalizedKey,
    glyphs,
    currentFootprint,
    maxFootprint,
    fidelity: builder.fidelity,
  };
}

export function renderArduPilotOsdScreen(input: {
  placements: readonly OsdRenderPlacement[];
  grid: OsdGridModel;
  context: OsdRenderContext;
}): OsdScreenRender {
  const placementByKey = new Map(input.placements.map((placement) => [placement.key, placement]));
  const ordered = [
    ...KNOWN_ARDUPILOT_OSD_ITEM_KEYS.flatMap((key) => {
      const placement = placementByKey.get(key);
      return placement ? [placement] : [];
    }),
    ...input.placements.filter((placement) => !KNOWN_KEY_SET.has(placement.key)),
  ];
  const cells = new Map<string, OsdScreenGlyph>();
  const items = new Map<string, OsdItemRender>();
  const partialItemKeys: string[] = [];

  for (const placement of ordered) {
    const item = renderArduPilotOsdItem(placement.key, input.context);
    items.set(placement.key, item);
    if (item.fidelity === "partial") {
      partialItemKeys.push(placement.key);
    }
    for (const write of item.glyphs) {
      if (write.hidden) {
        continue;
      }
      const x = placement.x + write.x;
      const y = placement.y + write.y;
      if (x < 0 || y < 0 || x >= input.grid.columns || y >= input.grid.rows) {
        continue;
      }
      cells.set(`${x}:${y}`, { x, y, glyph: write.glyph, ownerKey: placement.key });
    }
  }

  return {
    glyphs: [...cells.values()],
    items,
    partialItemKeys,
  };
}

export function osdFootprintsOverlap(
  left: { x: number; y: number; footprint: OsdFootprint },
  right: { x: number; y: number; footprint: OsdFootprint },
): boolean {
  const leftMinX = left.x + left.footprint.minX;
  const leftMinY = left.y + left.footprint.minY;
  const rightMinX = right.x + right.footprint.minX;
  const rightMinY = right.y + right.footprint.minY;
  return (
    leftMinX < rightMinX + right.footprint.width
    && leftMinX + left.footprint.width > rightMinX
    && leftMinY < rightMinY + right.footprint.height
    && leftMinY + left.footprint.height > rightMinY
  );
}

class PanelBuilder {
  readonly glyphs: OsdGlyphWrite[] = [];
  fidelity: OsdRenderFidelity = "live";

  constructor(
    readonly key: string,
    readonly context: OsdRenderContext,
  ) {}

  partial(): void {
    this.fidelity = "partial";
  }

  write(x: number, y: number, tokens: readonly Token[], blink = false): void {
    const packed = optionEnabled(this.context, 0) ? packDecimalTokens(tokens) : [...tokens];
    const hidden = blink && blinkIsHidden(this.context.nowMs);
    packed.forEach((glyph, index) => {
      if (glyph !== 0x20) {
        this.glyphs.push({ x: x + index, y, glyph, hidden });
      }
    });
  }

  text(x: number, y: number, text: string, blink = false): void {
    this.write(x, y, textTokens(text), blink);
  }

  finish(): OsdGlyphWrite[] {
    return this.glyphs;
  }
}

function renderKnownPanel(builder: PanelBuilder, key: string, context: OsdRenderContext): void {
  const telemetry = context.telemetry;
  switch (key) {
    case "ALTITUDE": {
      const altitude = relativeAltitude(context);
      writeNumberWithUnit(builder, altitude, "altitude", 4, 0);
      return;
    }
    case "BAT_VOLT":
      renderBatteryVoltage(builder, telemetry.battery_voltage_v, telemetry.battery_pct, false);
      return;
    case "BAT2_VLT":
      renderBatteryVoltage(builder, null, null, false);
      return;
    case "AVGCELLV":
      renderBatteryVoltage(builder, averageCellVoltage(context), telemetry.battery_pct, true);
      return;
    case "ACRVOLT":
    case "RESTVOLT":
      builder.partial();
      renderBatteryVoltage(builder, key === "ACRVOLT" ? averageCellVoltage(context) : telemetry.battery_voltage_v, telemetry.battery_pct, key === "ACRVOLT");
      return;
    case "RSSI": {
      const rssi = finite(telemetry.rc_rssi);
      if (rssi === null) builder.partial();
      const normalized = rssi === null ? null : rssi > 100 ? (rssi / 255) * 100 : rssi;
      const value = normalized === null ? "--" : integer(normalized).padStart(2);
      builder.write(0, 0, [SYMBOL.RSSI, ...textTokens(value)], normalized !== null && normalized < param(context, "OSD_W_RSSI", 30));
      return;
    }
    case "LINK_Q":
    case "RC_LQ": {
      const rssi = finite(telemetry.rc_rssi);
      if (rssi === null) builder.partial();
      const value = rssi === null ? "--" : integer(rssi > 100 ? (rssi / 255) * 100 : rssi).padStart(2);
      builder.write(0, 0, [SYMBOL.LQ, ...textTokens(value)]);
      return;
    }
    case "CURRENT":
      renderCurrent(builder, telemetry.battery_current_a);
      return;
    case "CURRENT2":
      builder.partial();
      renderCurrent(builder, null);
      return;
    case "BATUSED":
    case "BAT2USED":
      builder.partial();
      builder.write(0, 0, [...textTokens("   0"), SYMBOL.MAH]);
      return;
    case "SATS": {
      const satellites = finite(telemetry.gps_satellites);
      if (satellites === null) builder.partial();
      const value = satellites === null ? "--" : integer(satellites).padStart(2);
      const badFix = !telemetry.gps_fix_type?.toLowerCase().match(/3d|rtk/);
      builder.write(0, 0, [SYMBOL.SAT_L, SYMBOL.SAT_R, ...textTokens(value)], satellites !== null && (satellites < param(context, "OSD_W_NSAT", 9) || badFix));
      return;
    }
    case "FLTMODE": {
      const mode = context.vehicleState?.mode_name?.trim();
      if (!mode) builder.partial();
      builder.write(0, 0, [
        ...textTokens((mode || "MODE --").toUpperCase()),
        context.vehicleState?.armed ? SYMBOL.ARMED : SYMBOL.DISARMED,
      ]);
      return;
    }
    case "MESSAGE": {
      if (!context.statusMessage) builder.partial();
      const message = normalizeMessage(context.statusMessage ?? "NO MESSAGE");
      builder.text(0, 0, scrollMessage(message, context.nowMs));
      return;
    }
    case "GSPEED":
      renderSpeed(builder, finite(telemetry.speed_mps), SYMBOL.GSPD, 0);
      return;
    case "ASPEED":
    case "ASPD1":
      renderAirspeed(builder, finite(telemetry.airspeed_mps));
      return;
    case "ASPD2":
      builder.partial();
      renderAirspeed(builder, null);
      return;
    case "HORIZON":
      renderHorizon(builder, finite(telemetry.roll_deg), finite(telemetry.pitch_deg));
      return;
    case "HOME":
      renderHome(builder, context);
      return;
    case "HOMEDIST": {
      const home = homeVector(context);
      if (!home) builder.partial();
      writeDistance(builder, 0, 0, home?.distanceM ?? null);
      return;
    }
    case "HOMEDIR": {
      const home = homeVector(context);
      if (!home) builder.partial();
      builder.write(0, 0, [arrowGlyph(home?.relativeBearingDeg ?? 0, context)]);
      return;
    }
    case "HEADING": {
      const heading = finite(telemetry.heading_deg);
      if (heading === null) builder.partial();
      builder.write(0, 0, [...textTokens(heading === null ? "---" : integer(wrapDegrees(heading)).padStart(3)), SYMBOL.DEGR]);
      return;
    }
    case "THROTTLE": {
      const throttle = finite(telemetry.throttle_pct);
      if (throttle === null) builder.partial();
      builder.write(0, 0, [...textTokens(throttle === null ? "---" : integer(throttle).padStart(3)), SYMBOL.PCNT]);
      return;
    }
    case "COMPASS":
      renderCompass(builder, finite(telemetry.heading_deg));
      return;
    case "WIND":
      builder.partial();
      builder.write(0, 0, [SYMBOL.WIND, arrowGlyph(0, context), ...textTokens("---"), unitIcon(context, "speed")]);
      return;
    case "VSPEED":
      renderVerticalSpeed(builder, finite(telemetry.climb_rate_mps));
      return;
    case "ESCTEMP":
      renderTemperature(builder, null);
      return;
    case "ESCRPM":
    case "RPM":
      builder.partial();
      builder.write(0, 0, [...textTokens("  -1"), SYMBOL.RPM]);
      return;
    case "ESCAMPS":
      builder.partial();
      builder.write(0, 0, [...textTokens(" ---"), SYMBOL.AMP]);
      return;
    case "GPSLAT":
      renderCoordinate(builder, finite(telemetry.latitude_deg), SYMBOL.GPS_LAT);
      return;
    case "GPSLONG":
      renderCoordinate(builder, finite(telemetry.longitude_deg), SYMBOL.GPS_LONG);
      return;
    case "ROLL":
      renderAngle(builder, finite(telemetry.roll_deg), "roll");
      return;
    case "PITCH":
      renderAngle(builder, finite(telemetry.pitch_deg), "pitch");
      return;
    case "TEMP":
    case "BTEMP":
    case "ATEMP":
      renderTemperature(builder, null);
      return;
    case "HDOP": {
      const hdop = finite(telemetry.gps_hdop);
      if (hdop === null) builder.partial();
      builder.write(0, 0, [SYMBOL.HDOP_L, SYMBOL.HDOP_R, ...textTokens(hdop === null ? "--.--" : hdop.toFixed(2).padStart(4))]);
      return;
    }
    case "WAYPOINT": {
      const distance = finite(telemetry.wp_dist_m);
      const bearing = finite(telemetry.target_bearing_deg);
      if (distance === null || bearing === null) builder.partial();
      const heading = finite(telemetry.heading_deg) ?? 0;
      builder.write(0, 0, [SYMBOL.WPNO, ...textTokens("--"), arrowGlyph((bearing ?? heading) - heading, context)]);
      return;
    }
    case "XTRACK": {
      const error = finite(telemetry.xtrack_error_m);
      if (error === null) builder.partial();
      builder.write(0, 0, [SYMBOL.XERR]);
      writeDistance(builder, 1, 0, error === null ? null : Math.abs(error));
      return;
    }
    case "STATS":
      renderStats(builder, context);
      return;
    case "DIST":
      builder.partial();
      builder.write(0, 0, [SYMBOL.DIST]);
      writeDistance(builder, 1, 0, null);
      return;
    case "FLTIME":
      builder.partial();
      builder.write(0, 0, [SYMBOL.FLY, ...textTokens(" --:--")]);
      return;
    case "EFF":
      renderEfficiency(builder, context);
      return;
    case "CLIMBEFF":
      renderClimbEfficiency(builder, context);
      return;
    case "CLK": {
      const date = new Date(context.nowMs);
      const time = Number.isFinite(date.getTime())
        ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
        : "--:--";
      builder.write(0, 0, [SYMBOL.CLK, ...textTokens(time)]);
      return;
    }
    case "PLUSCODE":
      builder.partial();
      builder.text(0, 0, "--------+--");
      return;
    case "CALLSIGN":
      builder.partial();
      builder.text(0, 0, "CALLSIGN");
      return;
    case "VTX_PWR":
    case "RC_PWR":
      builder.partial();
      builder.write(0, 0, [...textTokens(" ---"), SYMBOL.MW]);
      return;
    case "TER_HGT": {
      const terrain = finite(telemetry.height_above_terrain_m);
      if (terrain === null) builder.partial();
      builder.write(0, 0, [
        ...textTokens(terrain === null ? " ---" : integer(unitScale(context, "altitude", terrain)).padStart(4)),
        unitIcon(context, "altitude"),
        SYMBOL.TERALT,
      ]);
      return;
    }
    case "FENCE":
      builder.partial();
      builder.write(0, 0, [SYMBOL.FENCE_DISABLED]);
      return;
    case "RNGF":
      builder.partial();
      builder.write(0, 0, [SYMBOL.RNGFD, ...textTokens("---"), unitIcon(context, "distance")]);
      return;
    case "RSSIDBM":
      builder.partial();
      builder.write(0, 0, [SYMBOL.RSSI, ...textTokens("----"), SYMBOL.DBM]);
      return;
    case "RC_SNR":
      builder.partial();
      builder.write(0, 0, [SYMBOL.SNR, ...textTokens("---"), SYMBOL.DB]);
      return;
    case "RC_ANT":
      builder.partial();
      builder.write(0, 0, [SYMBOL.ANT, ...textTokens("-")]);
      return;
    case "SIDEBARS":
      renderSidebars(builder, context);
      return;
    case "CRSSHAIR":
      builder.write(-1, 0, [SYMBOL.AH_CENTER_LINE_LEFT, SYMBOL.AH_CENTER, SYMBOL.AH_CENTER_LINE_RIGHT]);
      return;
    case "POWER": {
      const volts = finite(telemetry.battery_voltage_v);
      const amps = finite(telemetry.battery_current_a);
      if (volts === null || amps === null) builder.partial();
      const watts = volts === null || amps === null ? null : volts * amps;
      builder.write(0, 0, [...textTokens(watts === null ? " ---" : integer(watts).padStart(4)), SYMBOL.WATT]);
      return;
    }
    case "CELLVOLT":
      renderBatteryVoltage(builder, averageCellVoltage(context), telemetry.battery_pct, true);
      return;
    case "BATTBAR": {
      const pct = finite(telemetry.battery_pct);
      if (pct === null) builder.partial();
      const glyph = pct === null ? SYMBOL.BATT_UNKNOWN : batteryGlyph(pct);
      builder.write(0, 0, [glyph, glyph, glyph, glyph, glyph, glyph, glyph]);
      return;
    }
    case "ARMING":
      builder.write(0, 0, textTokens(context.vehicleState?.armed ? "ARMED" : "DISARMED"));
      return;
    default:
      builder.partial();
      builder.text(0, 0, (key || "OSD").slice(0, 26));
  }
}

function renderBatteryVoltage(builder: PanelBuilder, value: number | null | undefined, pct: number | null | undefined, cell: boolean): void {
  const voltage = finite(value);
  const percent = finite(pct);
  if (voltage === null) builder.partial();
  const number = voltage === null ? (cell ? "-.--" : "--.-") : voltage.toFixed(cell ? 2 : 1);
  const tokens = [...textTokens(number), SYMBOL.VOLT];
  if (percent !== null) tokens.unshift(batteryGlyph(percent));
  builder.write(0, 0, tokens, voltage !== null && voltage < param(builder.context, cell ? "OSD_W_AVGCELLV" : "OSD_W_BATVOLT", cell ? 3.6 : 10));
}

function renderCurrent(builder: PanelBuilder, value: number | null | undefined): void {
  const current = finite(value);
  if (current === null) builder.partial();
  const text = current === null ? "--.--" : current < 10 ? current.toFixed(2) : current.toFixed(1);
  builder.write(0, 0, [...textTokens(text.padStart(4)), SYMBOL.AMP]);
}

function renderSpeed(builder: PanelBuilder, value: number | null, icon: number, relativeAngleDeg: number): void {
  if (value === null) builder.partial();
  const scaled = value === null ? null : unitScale(builder.context, "speed", value);
  builder.write(0, 0, [icon]);
  if (scaled === null) {
    builder.write(1, 0, [arrowGlyph(relativeAngleDeg, builder.context), ...textTokens("---"), unitIcon(builder.context, "speed")]);
  } else if (scaled < 9.95) {
    builder.write(1, 0, [arrowGlyph(relativeAngleDeg, builder.context), ...textTokens(` ${scaled.toFixed(1)}`), unitIcon(builder.context, "speed")]);
  } else {
    builder.write(1, 0, [arrowGlyph(relativeAngleDeg, builder.context), ...textTokens(integer(scaled).padStart(3)), unitIcon(builder.context, "speed")]);
  }
}

function renderAirspeed(builder: PanelBuilder, value: number | null): void {
  if (value === null) builder.partial();
  const text = value === null ? " ---" : integer(unitScale(builder.context, "speed", value)).padStart(4);
  builder.write(0, 0, [SYMBOL.ASPD, ...textTokens(text), unitIcon(builder.context, "speed")]);
}

function renderVerticalSpeed(builder: PanelBuilder, value: number | null): void {
  if (value === null) builder.partial();
  const scaled = value === null ? null : unitScale(builder.context, "vspeed", value);
  const magnitude = scaled === null ? "---" : Math.abs(scaled).toFixed(1).padStart(3);
  let arrow: number = SYMBOL.UP;
  if (scaled !== null) {
    if (scaled > 3) arrow = SYMBOL.UP_UP;
    else if (scaled < -3) arrow = SYMBOL.DOWN_DOWN;
    else if (scaled < 0) arrow = SYMBOL.DOWN;
  }
  builder.write(0, 0, [SYMBOL.VSPD, arrow, ...textTokens(magnitude), unitIcon(builder.context, "vspeed")]);
}

function renderHorizon(builder: PanelBuilder, rollDeg: number | null, pitchDeg: number | null): void {
  if (rollDeg === null || pitchDeg === null) builder.partial();
  let roll = ((rollDeg ?? 0) * Math.PI) / 180;
  let pitch = -Math.max(-20, Math.min(20, pitchDeg ?? 0)) * Math.PI / 180;
  const inverted = Math.abs(roll) >= Math.PI / 2;
  if (inverted && optionEnabled(builder.context, 6)) pitch = -pitch;
  if (optionEnabled(builder.context, 2)) roll = -roll;
  const ky = Math.sin(roll);
  const kx = Math.cos(roll);
  const ratio = 12 / 18;

  if (Math.abs(ky) < Math.abs(kx)) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const fy = ratio * dx * (ky / (kx || Number.EPSILON)) + pitch * (16 / ((80 * Math.PI) / 180)) + 0.5;
      const dy = Math.floor(fy);
      const fraction = Math.max(0, Math.min(8, Math.floor((fy - dy) * 9)));
      if (dy >= -4 && dy <= 4) builder.write(dx, -dy, [SYMBOL.AH_H_START + (8 - fraction)], inverted);
    }
  } else {
    for (let dy = -4; dy <= 4; dy += 1) {
      const fx = ((dy / ratio) - pitch * (16 / ((80 * Math.PI) / 180))) * (kx / (ky || Number.EPSILON)) + 0.5;
      const dx = Math.floor(fx);
      const fraction = Math.max(0, Math.min(5, Math.floor((fx - dx) * 6)));
      if (dx >= -4 && dx <= 4) builder.write(dx, -dy, [SYMBOL.AH_V_START + fraction], inverted);
    }
  }
  if (!optionEnabled(builder.context, 4)) {
    builder.write(-1, 0, [SYMBOL.AH_CENTER_LINE_LEFT, SYMBOL.AH_CENTER, SYMBOL.AH_CENTER_LINE_RIGHT]);
  }
}

function renderHome(builder: PanelBuilder, context: OsdRenderContext): void {
  const home = homeVector(context);
  if (!home) builder.partial();
  builder.write(0, 0, [SYMBOL.HOME, arrowGlyph(home?.relativeBearingDeg ?? 0, context)]);
  writeDistance(builder, 2, 0, home?.distanceM ?? null);
}

function renderCompass(builder: PanelBuilder, heading: number | null): void {
  if (heading === null) builder.partial();
  const compass = [
    SYMBOL.HEADING_N,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_DIVIDED_LINE,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_E,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_DIVIDED_LINE,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_S,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_DIVIDED_LINE,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_W,
    SYMBOL.HEADING_LINE,
    SYMBOL.HEADING_DIVIDED_LINE,
    SYMBOL.HEADING_LINE,
  ];
  const interval = 360 / compass.length;
  const center = Math.round(wrapDegrees(heading ?? 0) / interval) % compass.length;
  for (let offset = -4; offset <= 4; offset += 1) {
    builder.write(offset, 0, [compass[(center + offset + compass.length) % compass.length] ?? SYMBOL.HEADING_LINE]);
  }
}

function renderCoordinate(builder: PanelBuilder, value: number | null, symbol: number): void {
  if (value === null) builder.partial();
  if (value === null) {
    builder.write(0, 0, [symbol, ...textTokens(" ---.-------")]);
    return;
  }
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute);
  const fraction = Math.round((absolute - whole) * 10_000_000) % 10_000_000;
  const wholeText = `${negative ? "-" : ""}${whole}`.padStart(4);
  builder.write(0, 0, [symbol, ...textTokens(`${wholeText}.${String(fraction).padStart(7, "0")}`)]);
}

function renderAngle(builder: PanelBuilder, value: number | null, kind: "roll" | "pitch"): void {
  if (value === null) builder.partial();
  let symbol: number = kind === "roll" ? SYMBOL.ROLL0 : SYMBOL.PTCH0;
  if (value !== null && value > 0) symbol = kind === "roll" ? SYMBOL.ROLLR : SYMBOL.PTCHUP;
  if (value !== null && value < 0) symbol = kind === "roll" ? SYMBOL.ROLLL : SYMBOL.PTCHDWN;
  builder.write(0, 0, [symbol, ...textTokens(value === null ? "---" : integer(Math.abs(value)).padStart(3)), SYMBOL.DEGR]);
}

function renderTemperature(builder: PanelBuilder, value: number | null): void {
  if (value === null) builder.partial();
  builder.write(0, 0, [
    ...textTokens(value === null ? " --" : integer(unitScale(builder.context, "temperature", value)).padStart(3)),
    unitIcon(builder.context, "temperature"),
  ]);
}

function renderStats(builder: PanelBuilder, context: OsdRenderContext): void {
  builder.partial();
  builder.text(2, 0, "MAX");
  builder.write(0, 1, [SYMBOL.GSPD]);
  writeNumberWithUnit(builder, finite(context.telemetry.speed_mps), "speed", 4, 1, 1);
  builder.write(0, 2, [...textTokens(finite(context.telemetry.battery_current_a)?.toFixed(1).padStart(5) ?? "  ---"), SYMBOL.AMP]);
  writeNumberWithUnit(builder, relativeAltitude(context), "altitude", 5, 3);
  builder.write(0, 4, [SYMBOL.HOME]);
  writeDistance(builder, 1, 4, homeVector(context)?.distanceM ?? null);
  builder.write(0, 5, [SYMBOL.DIST]);
  writeDistance(builder, 1, 5, null);
}

function renderEfficiency(builder: PanelBuilder, context: OsdRenderContext): void {
  const speed = finite(context.telemetry.speed_mps);
  const current = finite(context.telemetry.battery_current_a);
  if (speed === null || current === null || speed <= 2) {
    builder.partial();
    builder.write(0, 0, [SYMBOL.EFF, ...textTokens("---"), SYMBOL.MAH]);
    return;
  }
  builder.write(0, 0, [SYMBOL.EFF, ...textTokens(integer((1000 * current) / unitScale(context, "speed", speed)).padStart(3)), SYMBOL.MAH]);
}

function renderClimbEfficiency(builder: PanelBuilder, context: OsdRenderContext): void {
  const climb = finite(context.telemetry.climb_rate_mps);
  const current = finite(context.telemetry.battery_current_a);
  if (climb === null || current === null || current <= 0) {
    builder.partial();
    builder.write(0, 0, [SYMBOL.PTCHUP, SYMBOL.EFF, ...textTokens("---"), unitIcon(context, "distance")]);
    return;
  }
  const value = (3.6 * unitScale(context, "vspeed", Math.max(0, climb))) / current;
  builder.write(0, 0, [SYMBOL.PTCHUP, SYMBOL.EFF, ...textTokens(value.toFixed(1).padStart(3)), unitIcon(context, "distance")]);
}

function renderSidebars(builder: PanelBuilder, context: OsdRenderContext): void {
  const airspeed = finite(context.telemetry.airspeed_mps);
  const altitude = relativeAltitude(context);
  if (airspeed === null || altitude === null) builder.partial();
  const extension = Math.max(0, Math.min(6, Math.round(param(context, "OSD_SB_V_EXT", 0))));
  const horizontalOffset = Math.max(0, Math.min(12, Math.round(param(context, "OSD_SB_H_OFS", 0))));
  const height = 7 + extension * 2;
  const middle = Math.floor(height / 2);
  const sectors = [SYMBOL.SIDEBAR_A, SYMBOL.SIDEBAR_B, SYMBOL.SIDEBAR_C, SYMBOL.SIDEBAR_D, SYMBOL.SIDEBAR_E, SYMBOL.SIDEBAR_F, SYMBOL.SIDEBAR_G, SYMBOL.SIDEBAR_E, SYMBOL.SIDEBAR_F, SYMBOL.SIDEBAR_G, SYMBOL.SIDEBAR_E, SYMBOL.SIDEBAR_F, SYMBOL.SIDEBAR_G, SYMBOL.SIDEBAR_E, SYMBOL.SIDEBAR_F, SYMBOL.SIDEBAR_H, SYMBOL.SIDEBAR_I, SYMBOL.SIDEBAR_J];
  const speedValue = airspeed === null ? 0 : unitScale(context, "speed", airspeed);
  const altitudeValue = altitude === null ? 0 : unitScale(context, "altitude", altitude);
  let speedIndex = Math.floor(((speedValue % 10) / 10) * sectors.length);
  let altitudeIndex = Math.floor(((altitudeValue % 10) / 10) * sectors.length);
  for (let row = 0; row < height; row += 1) {
    if (row === middle) {
      builder.write(0, row, [...textTokens(integer(speedValue).padStart(3)), unitIcon(context, "speed"), SYMBOL.SIDEBAR_R_ARROW]);
      builder.write(16 + horizontalOffset, row, [SYMBOL.SIDEBAR_L_ARROW, ...textTokens(integer(altitudeValue).padStart(3)), unitIcon(context, "altitude")]);
    } else {
      builder.write(4, row, [sectors[(speedIndex + sectors.length) % sectors.length] ?? SYMBOL.SIDEBAR_E]);
      builder.write(16 + horizontalOffset, row, [sectors[(altitudeIndex + sectors.length) % sectors.length] ?? SYMBOL.SIDEBAR_E]);
    }
    speedIndex = (speedIndex + 12) % sectors.length;
    altitudeIndex = (altitudeIndex + 12) % sectors.length;
  }
}

function writeNumberWithUnit(
  builder: PanelBuilder,
  value: number | null,
  kind: UnitKind,
  width: number,
  y: number,
  x = 0,
): void {
  if (value === null) builder.partial();
  const text = value === null ? "-".repeat(width) : integer(unitScale(builder.context, kind, value)).padStart(width);
  builder.write(x, y, [...textTokens(text), unitIcon(builder.context, kind)]);
}

function writeDistance(builder: PanelBuilder, x: number, y: number, distanceM: number | null): void {
  if (distanceM === null) {
    builder.partial();
    builder.write(x, y, [...textTokens("----"), unitIcon(builder.context, "distance")]);
    return;
  }
  let scaled = unitScale(builder.context, "distance", distanceM);
  let icon = unitIcon(builder.context, "distance");
  let text: string;
  const imperialMiles = units(builder.context) === 1 && optionEnabled(builder.context, 3) && scaled > 5280;
  if (scaled > 9999 || imperialMiles) {
    scaled = unitScale(builder.context, "distance_long", distanceM);
    icon = unitIcon(builder.context, "distance_long");
    if (scaled < 9) text = scaled.toFixed(3);
    else if (scaled < 99) text = scaled.toFixed(2);
    else if (scaled < 999) text = scaled.toFixed(1);
    else text = integer(scaled).padStart(4);
  } else if (scaled < 10) {
    text = scaled.toFixed(1).padStart(4);
  } else {
    text = integer(scaled).padStart(4);
  }
  builder.write(x, y, [...textTokens(text), icon]);
}

function maximumFootprint(key: string, context: OsdRenderContext, current: OsdFootprint): OsdFootprint {
  const sidebarHeight = 7 + Math.max(0, Math.min(6, Math.round(param(context, "OSD_SB_V_EXT", 0)))) * 2;
  const sidebarWidth = 21 + Math.max(0, Math.min(12, Math.round(param(context, "OSD_SB_H_OFS", 0))));
  const widths: Record<string, number> = {
    ALTITUDE: 5, BAT_VOLT: 6, BAT2_VLT: 6, AVGCELLV: 6, ACRVOLT: 6, RESTVOLT: 6,
    RSSI: 3, LINK_Q: 3, RC_LQ: 6, CURRENT: 6, CURRENT2: 6, BATUSED: 5, BAT2USED: 5,
    SATS: 4, FLTMODE: 13, MESSAGE: 26, GSPEED: 7, ASPEED: 6, ASPD1: 6, ASPD2: 6,
    HOME: 7, HOMEDIST: 5, HOMEDIR: 1, HEADING: 4, THROTTLE: 4, WIND: 6, VSPEED: 6,
    ESCTEMP: 4, ESCRPM: 6, ESCAMPS: 6, GPSLAT: 13, GPSLONG: 13, ROLL: 5, PITCH: 5,
    TEMP: 4, BTEMP: 4, ATEMP: 4, HDOP: 7, WAYPOINT: 4, XTRACK: 6, DIST: 6, FLTIME: 7,
    EFF: 5, CLIMBEFF: 6, CLK: 6, PLUSCODE: 11, CALLSIGN: 16, VTX_PWR: 5, RC_PWR: 5,
    TER_HGT: 6, FENCE: 1, RNGF: 6, RSSIDBM: 6, RC_SNR: 5, RC_ANT: 2, POWER: 5,
    CELLVOLT: 6, BATTBAR: 7, ARMING: 8, RPM: 6,
  };
  if (key === "HORIZON") return { minX: -4, minY: -4, width: 9, height: 9 };
  if (key === "COMPASS") return { minX: -4, minY: 0, width: 9, height: 1 };
  if (key === "CRSSHAIR") return { minX: -1, minY: 0, width: 3, height: 1 };
  if (key === "STATS") return { minX: 0, minY: 0, width: 7, height: 6 };
  if (key === "SIDEBARS") return { minX: 0, minY: 0, width: sidebarWidth, height: sidebarHeight };
  const width = widths[key] ?? Math.max(current.width, Math.min(26, Math.max(3, key.length)));
  return { minX: Math.min(0, current.minX), minY: Math.min(0, current.minY), width: Math.max(width, current.width), height: Math.max(1, current.height) };
}

function footprintForGlyphs(glyphs: readonly OsdGlyphWrite[]): OsdFootprint {
  if (glyphs.length === 0) return { minX: 0, minY: 0, width: 1, height: 1 };
  const xs = glyphs.map((glyph) => glyph.x);
  const ys = glyphs.map((glyph) => glyph.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    minX,
    minY,
    width: Math.max(...xs) - minX + 1,
    height: Math.max(...ys) - minY + 1,
  };
}

function textTokens(value: string): Token[] {
  return [...value].map((character) => {
    const code = character.charCodeAt(0);
    return code >= 0 && code <= 255 ? code : 0x3f;
  });
}

function packDecimalTokens(tokens: readonly Token[]): Token[] {
  const output = [...tokens];
  for (let index = 1; index < output.length - 1; index += 1) {
    if (output[index] !== 0x2e || !isAsciiDigit(output[index - 1]) || !isAsciiDigit(output[index + 1])) continue;
    output[index - 1] = (output[index - 1] ?? 0) + 0x90;
    output[index + 1] = (output[index + 1] ?? 0) + 0xa0;
    output.splice(index, 1);
    break;
  }
  return output;
}

function isAsciiDigit(value: number | undefined): boolean {
  return value !== undefined && value >= 0x30 && value <= 0x39;
}

function units(context: OsdRenderContext): number {
  return Math.max(0, Math.min(3, Math.round(param(context, "OSD_UNITS", 0))));
}

function unitScale(context: OsdRenderContext, kind: UnitKind, value: number): number {
  const selected = units(context);
  const scales: Record<UnitKind, readonly number[]> = {
    altitude: [1, 3.28084, 1, 3.28084],
    speed: [3.6, 2.23694, 1, 1.94384],
    vspeed: [1, 3.28084, 1, 196.85],
    distance: [1, 3.28084, 1, 3.28084],
    distance_long: [1 / 1000, 1 / 1609.34, 1 / 1000, 0.000539957],
    temperature: [1, 1.8, 1, 1],
  };
  const offset = kind === "temperature" && selected === 1 ? 32 : 0;
  return value * (scales[kind][selected] ?? 1) + offset;
}

function unitIcon(context: OsdRenderContext, kind: UnitKind): number {
  const selected = units(context);
  const icons: Record<UnitKind, readonly number[]> = {
    altitude: [SYMBOL.ALT_M, SYMBOL.ALT_FT, SYMBOL.ALT_M, SYMBOL.ALT_FT],
    speed: [SYMBOL.KMH, SYMBOL.MPH, SYMBOL.MS, SYMBOL.KN],
    vspeed: [SYMBOL.MS, SYMBOL.FS, SYMBOL.MS, SYMBOL.FTMIN],
    distance: [SYMBOL.M, SYMBOL.FT, SYMBOL.M, SYMBOL.FT],
    distance_long: [SYMBOL.KM, SYMBOL.MI, SYMBOL.KM, SYMBOL.NM],
    temperature: [SYMBOL.DEGREES_C, SYMBOL.DEGREES_F, SYMBOL.DEGREES_C, SYMBOL.DEGREES_C],
  };
  return icons[kind][selected] ?? icons[kind][0] ?? SYMBOL.M;
}

function relativeAltitude(context: OsdRenderContext): number | null {
  const altitude = finite(context.telemetry.altitude_m);
  if (altitude === null) return null;
  const homeAltitude = finite(context.homePosition?.altitude_m);
  return homeAltitude === null ? altitude : altitude - homeAltitude;
}

function averageCellVoltage(context: OsdRenderContext): number | null {
  const cells = context.telemetry.battery_voltage_cells?.map(finite).filter((value): value is number => value !== null) ?? [];
  if (cells.length > 0) return cells.reduce((sum, value) => sum + value, 0) / cells.length;
  const voltage = finite(context.telemetry.battery_voltage_v);
  const cellCount = Math.round(param(context, "OSD_CELL_COUNT", -1));
  return voltage !== null && cellCount > 0 ? voltage / cellCount : null;
}

function homeVector(context: OsdRenderContext): { distanceM: number; relativeBearingDeg: number } | null {
  const latitude = finite(context.telemetry.latitude_deg);
  const longitude = finite(context.telemetry.longitude_deg);
  const homeLatitude = finite(context.homePosition?.latitude_deg);
  const homeLongitude = finite(context.homePosition?.longitude_deg);
  if (latitude === null || longitude === null || homeLatitude === null || homeLongitude === null) return null;
  const bearing = bearingDegrees(latitude, longitude, homeLatitude, homeLongitude);
  const heading = finite(context.telemetry.heading_deg) ?? 0;
  return {
    distanceM: haversineDistanceM(latitude, longitude, homeLatitude, homeLongitude),
    relativeBearingDeg: wrapDegrees(bearing - heading),
  };
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusM = 6_371_000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(deltaPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const lambda = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return wrapDegrees((Math.atan2(y, x) * 180) / Math.PI);
}

function arrowGlyph(angleDeg: number, context: OsdRenderContext): number {
  let angle = wrapDegrees(angleDeg);
  if (optionEnabled(context, 5)) angle = angle > 180 ? 540 - angle : 180 - angle;
  return SYMBOL.ARROW_START + Math.round(angle / (360 / 16)) % 16;
}

function batteryGlyph(percent: number): number {
  return SYMBOL.BATT_FULL + Math.max(0, Math.min(6, Math.floor((100 - percent) / 16.6)));
}

function normalizeMessage(value: string): string {
  return value.toUpperCase().replace(/\s+/g, " ").trim().slice(0, 64);
}

function scrollMessage(value: string, nowMs: number): string {
  if (value.length <= 26) return value;
  const scrollDistance = value.length - 26;
  const delay = 5;
  const cycles = 2 * delay + 2 * scrollDistance;
  const cycle = Math.floor(nowMs / 200) % cycles;
  const start = cycle < cycles / 2 ? cycle - delay : cycles - cycle;
  return value.slice(Math.max(0, Math.min(scrollDistance, start)), Math.max(0, Math.min(scrollDistance, start)) + 26);
}

function optionEnabled(context: OsdRenderContext, bit: number): boolean {
  return (Math.round(param(context, "OSD_OPTIONS", 1)) & (1 << bit)) !== 0;
}

function param(context: OsdRenderContext, name: string, fallback: number): number {
  return finite(context.paramValues[name]) ?? fallback;
}

function blinkIsHidden(nowMs: number): boolean {
  return Math.floor(Math.max(0, nowMs) / 250) % 4 < 2;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: number): string {
  return String(Math.round(value));
}

function wrapDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
