import { Map, Activity, Crosshair, Route, FileText, Settings, Wrench } from "lucide-react";

export type ActiveTab = "map" | "telemetry" | "hud" | "mission" | "logs" | "settings" | "setup";

export const TABS: { id: ActiveTab; label: string; Icon: typeof Map }[] = [
  { id: "map", label: "Map", Icon: Map },
  { id: "telemetry", label: "Telemetry", Icon: Activity },
  { id: "hud", label: "HUD", Icon: Crosshair },
  { id: "mission", label: "Mission", Icon: Route },
  { id: "logs", label: "Logs", Icon: FileText },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "setup", label: "Setup", Icon: Wrench },
];
