import { Map, Activity, Crosshair, Route, Sliders, FileText, Settings, Wrench } from "lucide-react";

export type ActiveTab = "map" | "telemetry" | "hud" | "mission" | "config" | "logs" | "settings" | "setup";

export const TABS: { id: ActiveTab; label: string; Icon: typeof Map }[] = [
  { id: "map", label: "Map", Icon: Map },
  { id: "telemetry", label: "Telemetry", Icon: Activity },
  { id: "hud", label: "HUD", Icon: Crosshair },
  { id: "mission", label: "Mission", Icon: Route },
  { id: "config", label: "Config", Icon: Sliders },
  { id: "logs", label: "Logs", Icon: FileText },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "setup", label: "Setup", Icon: Wrench },
];
