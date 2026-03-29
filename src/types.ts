import { LayoutDashboard, Activity, Crosshair, Route, FileText, Settings, Wrench } from "lucide-react";

export type ActiveTab = "overview" | "telemetry" | "hud" | "mission" | "logs" | "settings" | "setup";

export const TABS: { id: ActiveTab; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "telemetry", label: "Telemetry", Icon: Activity },
  { id: "hud", label: "HUD", Icon: Crosshair },
  { id: "mission", label: "Mission", Icon: Route },
  { id: "logs", label: "Logs", Icon: FileText },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "setup", label: "Setup", Icon: Wrench },
];
