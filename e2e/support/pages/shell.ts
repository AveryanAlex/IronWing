import { expect, type Page } from "@playwright/test";

import { noopLayoutAudit, type LayoutAudit } from "../layout";

export type WorkspaceKey = "overview" | "telemetry" | "hud" | "mission" | "logs" | "firmware" | "setup" | "settings";

const ids = {
  activeWorkspace: "app-shell-active-workspace",
  bootstrapFailure: "app-bootstrap-failure",
  bootstrapState: "app-bootstrap-state",
  shell: "app-shell",
  sessionSource: "app-shell-session-source",
  tier: "app-shell-tier",
} as const;

const workspaceLabels: Record<WorkspaceKey, string> = {
  overview: "Overview",
  telemetry: "Telemetry",
  hud: "HUD",
  mission: "Mission",
  logs: "Logs",
  firmware: "Firmware",
  setup: "Setup",
  settings: "App settings",
};

export class ShellPage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async expectReady(): Promise<void> {
    await expect(this.page).toHaveTitle(/IronWing/);
    await expect(this.page.getByTestId(ids.shell)).toBeVisible({ timeout: 20_000 });
    await expect(this.page.getByTestId(ids.bootstrapState)).toHaveText("ready", { timeout: 20_000 });
    await expect(this.page.getByTestId(ids.bootstrapFailure)).toHaveCount(0);
  }

  async expectLiveSession(): Promise<void> {
    await expect(this.page.getByTestId(ids.sessionSource)).toHaveText("live", { timeout: 20_000 });
  }

  async expectTier(tier: string): Promise<void> {
    await expect(this.page.getByTestId(ids.tier)).toHaveText(tier, { timeout: 10_000 });
  }

  async navigateTo(workspace: WorkspaceKey): Promise<void> {
    await this.page.getByRole("link", { name: workspaceLabels[workspace], exact: true }).click();
    await this.expectActiveWorkspace(workspace);
    await this.auditLayout(`navigate to ${workspace}`);
  }

  async expectActiveWorkspace(workspace: WorkspaceKey): Promise<void> {
    await expect(this.page.getByTestId(ids.activeWorkspace)).toHaveText(workspace, { timeout: 10_000 });
  }
}
