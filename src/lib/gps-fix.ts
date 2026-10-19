import type { GpsFixType } from "./generated/mavkit";

type GpsFixProfile = { label: string; tone: "positive" | "caution" | "critical"; has3dFix: boolean };
const GPS_FIX_PROFILES: Record<GpsFixType, GpsFixProfile> = {
  no_fix: { label: "No fix", tone: "critical", has3dFix: false },
  fix2d: { label: "2D fix", tone: "caution", has3dFix: false },
  fix3d: { label: "3D fix", tone: "positive", has3dFix: true },
  dgps: { label: "DGPS", tone: "positive", has3dFix: true },
  rtk_float: { label: "RTK float", tone: "positive", has3dFix: true },
  rtk_fixed: { label: "RTK fixed", tone: "positive", has3dFix: true },
};

export function gpsFixProfile(fix: GpsFixType | null | undefined): GpsFixProfile | undefined {
  return fix == null ? undefined : GPS_FIX_PROFILES[fix];
}
