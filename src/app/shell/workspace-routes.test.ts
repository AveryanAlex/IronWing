import { describe, expect, it } from "vitest";

import { appShellWorkspaces, workspaceForPath, workspaceForRouteId, workspacePath } from "./workspace-routes";

describe("workspace route metadata", () => {
  it("maps every workspace key to a stable route path", () => {
    expect(appShellWorkspaces.map((workspace) => [workspace.key, workspace.path])).toEqual([
      ["overview", "/"],
      ["telemetry", "/telemetry"],
      ["hud", "/hud"],
      ["mission", "/mission"],
      ["logs", "/logs"],
      ["firmware", "/firmware"],
      ["setup", "/setup"],
      ["settings", "/settings"],
    ]);
  });

  it("resolves paths and falls back to overview for unknown routes", () => {
    expect(workspaceForPath("/mission")).toBe("mission");
    expect(workspaceForPath("/mission/")).toBe("mission");
    expect(workspaceForPath("/setup/navigation")).toBe("setup");
    expect(workspaceForPath("/setup/navigation/")).toBe("setup");
    expect(workspaceForPath("/unknown")).toBe("overview");
  });

  it("resolves SvelteKit route IDs without deployment base path coupling", () => {
    expect(workspaceForRouteId("/(app)/telemetry")).toBe("telemetry");
    expect(workspaceForRouteId("/(app)/setup/navigation")).toBe("setup");
    expect(workspaceForRouteId("/(app)")).toBe("overview");
    expect(workspaceForRouteId(null)).toBe("overview");
  });

  it("resolves workspace keys to paths", () => {
    expect(workspacePath("logs")).toBe("/logs");
    expect(workspacePath("overview")).toBe("/");
  });
});
