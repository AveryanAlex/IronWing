import { expect, type Page } from "@playwright/test";

import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";

const ids = {
  blockedCopy: "firmware-workspace-blocked-copy",
  layoutMode: "firmware-workspace-layout-mode",
  mode: "firmware-workspace-mode",
  modeRecovery: "firmware-workspace-mode-recovery",
  recoveryBlockedReason: "firmware-workspace-recovery-blocked-reason",
  recoveryDeviceState: "firmware-workspace-recovery-device-state",
  recoveryPanel: "firmware-workspace-recovery-panel",
  recoverySafetyConfirm: "firmware-workspace-recovery-safety-confirm",
  startRecovery: "firmware-workspace-start-recovery",
  root: "firmware-workspace",
} as const;

export class FirmwareWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async expectInstallSurfaceSane(): Promise<void> {
    await expect(this.page.getByTestId(ids.root)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.mode)).toContainText("firmware-install-update");
    await expect(this.page.getByTestId(ids.layoutMode)).toContainText(/browse|desktop|phone|radiomaster/i);
    await expect(this.page.getByRole("button", { name: /Install or update flight firmware/i })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Select controller and prepare bootloader" })).toBeVisible();
    await expect(this.page.getByLabel("Serial port")).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Choose firmware" })).toBeVisible();
    await expect(this.page.getByRole("button", { name: "Start firmware update" })).toBeDisabled();
    await this.auditLayout("firmware install surface");
  }

  async expectCapabilityBannerIfLayoutBlocksActions(): Promise<void> {
    if ((await this.page.getByTestId(ids.blockedCopy).count()) === 0) {
      return;
    }

    await expect(this.page.getByTestId(ids.blockedCopy)).toBeVisible();
  }

  async switchToRecoveryModeAndExpectBlocked(): Promise<void> {
    await this.page.getByTestId(ids.modeRecovery).click();
    await expect(this.page.getByTestId(ids.recoveryPanel)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.recoveryDeviceState)).toBeVisible();
    await expect(this.page.getByTestId(ids.recoverySafetyConfirm)).toBeVisible();
    await expect(this.page.getByTestId(ids.recoveryBlockedReason)).toBeVisible();
    await expect(this.page.getByTestId(ids.startRecovery)).toBeDisabled();
    await this.auditLayout("firmware recovery mode");
  }

  async expectPrimaryActionsReachable(label = "firmware"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "firmware workspace", locator: this.page.getByTestId(ids.root) },
      {
        label: "install mode selector",
        locator: this.page.getByRole("button", { name: /Install or update flight firmware/i }),
        requireEnabled: true,
      },
      { label: "serial port selector", locator: this.page.getByLabel("Serial port") },
      { label: "start update action", locator: this.page.getByRole("button", { name: "Start firmware update" }) },
    ]);
  }
}
