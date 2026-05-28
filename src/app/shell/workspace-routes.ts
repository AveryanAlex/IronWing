export type AppShellWorkspace =
  | "overview"
  | "telemetry"
  | "hud"
  | "mission"
  | "logs"
  | "firmware"
  | "settings"
  | "setup";

export type AppShellWorkspacePath =
  | "/"
  | "/telemetry"
  | "/hud"
  | "/mission"
  | "/logs"
  | "/firmware"
  | "/settings"
  | "/setup";

export type AppShellWorkspaceRoute = {
  key: AppShellWorkspace;
  label: string;
  path: AppShellWorkspacePath;
};

export const appShellWorkspaces: ReadonlyArray<AppShellWorkspaceRoute> = [
  { key: "overview", label: "Overview", path: "/" },
  { key: "telemetry", label: "Telemetry", path: "/telemetry" },
  { key: "hud", label: "HUD", path: "/hud" },
  { key: "mission", label: "Mission", path: "/mission" },
  { key: "logs", label: "Logs", path: "/logs" },
  { key: "firmware", label: "Firmware", path: "/firmware" },
  { key: "setup", label: "Setup", path: "/setup" },
  { key: "settings", label: "App settings", path: "/settings" },
];

const WORKSPACE_BY_PATH = new Map<AppShellWorkspacePath, AppShellWorkspace>(
  appShellWorkspaces.map((workspace) => [workspace.path, workspace.key]),
);
const PATH_BY_WORKSPACE = new Map<AppShellWorkspace, AppShellWorkspacePath>(
  appShellWorkspaces.map((workspace) => [workspace.key, workspace.path]),
);

export function workspaceForPath(pathname: string): AppShellWorkspace {
  const normalizedPath = normalizeWorkspacePath(pathname);
  if (normalizedPath === "/setup" || normalizedPath.startsWith("/setup/")) {
    return "setup";
  }

  return isWorkspacePath(normalizedPath) ? WORKSPACE_BY_PATH.get(normalizedPath) ?? "overview" : "overview";
}

export function workspacePath(workspace: AppShellWorkspace): AppShellWorkspacePath {
  return PATH_BY_WORKSPACE.get(workspace) ?? "/";
}

function normalizeWorkspacePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function isWorkspacePath(pathname: string): pathname is AppShellWorkspacePath {
  return WORKSPACE_BY_PATH.has(pathname as AppShellWorkspacePath);
}
