import { describe, expect, it } from "vitest";

import { appShellWorkspaces, workspaceForPath, workspacePath } from "./workspace-routes";

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
    expect(workspaceForPath("/setup/gps")).toBe("setup");
    expect(workspaceForPath("/setup/gps/")).toBe("setup");
    expect(workspaceForPath("/unknown")).toBe("overview");
  });

  it("resolves workspace keys to paths", () => {
    expect(workspacePath("logs")).toBe("/logs");
    expect(workspacePath("overview")).toBe("/");
  });
});
