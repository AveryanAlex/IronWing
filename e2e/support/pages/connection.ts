import { expect, type Locator, type Page } from "@playwright/test";

export type DemoVehiclePreset = "quadcopter" | "airplane" | "quadplane";

const ids = {
  activeSource: "connection-diagnostics-active-source",
  bootstrap: "connection-diagnostics-bootstrap",
  closeVehiclePanel: "app-shell-vehicle-panel-close",
  connect: "connection-connect-btn",
  demoPreset: "connection-demo-preset",
  disconnect: "connection-disconnect-btn",
  helpButton: "connection-transport-help-btn",
  helpContent: "connection-transport-help-content",
  helpPopover: "connection-transport-help-popover",
  telemetryAltitude: "telemetry-alt-value",
  telemetryState: "telemetry-state-value",
  transport: "connection-transport-select",
  vehiclePanelButton: "app-shell-vehicle-panel-btn",
  vehiclePanelDrawer: "app-shell-vehicle-panel-drawer",
} as const;

export class ConnectionPage {
  constructor(private readonly page: Page) {}

  async connectDemo(preset: DemoVehiclePreset): Promise<void> {
    await this.ensureVehiclePanelVisible();
    await this.expectDemoTransportAvailable();

    await this.transportSelect().selectOption("demo");
    await expect(this.demoPreset()).toBeVisible();
    await this.demoPreset().selectOption(preset);
    await this.connectButton().click();

    await expect(this.disconnectButton()).toBeVisible({ timeout: 25_000 });
    await this.expectLiveTelemetry();
    await this.closeVehiclePanelDrawerIfOpen();
  }

  async disconnectIfConnected(): Promise<void> {
    await this.ensureVehiclePanelVisible();
    if (!(await this.isVisible(this.disconnectButton()))) {
      return;
    }

    await this.disconnectButton().click();
    await this.expectIdle();
  }

  async expectIdle(): Promise<void> {
    await this.ensureVehiclePanelVisible();
    await expect(this.connectButton()).toBeVisible({ timeout: 10_000 });
    await expect(this.connectButton()).toBeEnabled();
    await expect(this.disconnectButton()).toHaveCount(0);
    await expect(this.page.getByTestId(ids.bootstrap)).toHaveText("ready");
  }

  async expectDemoTransportHelp(): Promise<void> {
    await this.ensureVehiclePanelVisible();
    await this.transportSelect().selectOption("demo");
    await this.page.getByTestId(ids.helpButton).click();
    await expect(this.page.getByTestId(ids.helpPopover)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(ids.helpContent)).toContainText(/demo|vehicle|sim/i);
  }

  async expectDiagnosticsHydrated(): Promise<void> {
    await expect(this.page.getByTestId(ids.bootstrap)).toHaveText("ready", { timeout: 10_000 });
    await expect(this.page.getByTestId(ids.activeSource)).toHaveText(/none|live|stream|playback/i);
  }

  async expectPhoneDrawerOpensAndCloses(): Promise<void> {
    const panelButton = this.page.getByTestId(ids.vehiclePanelButton);
    await expect(panelButton).toBeVisible({ timeout: 10_000 });
    await panelButton.click();
    await expect(this.page.getByTestId(ids.vehiclePanelDrawer)).toHaveAttribute("data-state", "open", { timeout: 10_000 });
    await expect(this.transportSelect()).toBeVisible({ timeout: 10_000 });
    await this.closeVehiclePanelDrawerIfOpen();
  }

  async expectLiveTelemetry(): Promise<void> {
    await this.expectDiagnosticsHydrated();
    await this.expectMetricNotPlaceholder(ids.telemetryState);
    await this.expectMetricNotPlaceholder(ids.telemetryAltitude);
  }

  private async ensureVehiclePanelVisible(): Promise<void> {
    if (await this.isVisible(this.transportSelect())) {
      return;
    }

    const vehiclePanelButton = this.page.getByTestId(ids.vehiclePanelButton);
    await expect(vehiclePanelButton).toBeVisible({ timeout: 10_000 });
    await vehiclePanelButton.click();
    await expect(this.page.getByTestId(ids.vehiclePanelDrawer)).toHaveAttribute("data-state", "open", { timeout: 10_000 });
    await expect(this.transportSelect()).toBeVisible({ timeout: 10_000 });
  }

  private async closeVehiclePanelDrawerIfOpen(): Promise<void> {
    const closeButton = this.page.getByTestId(ids.closeVehiclePanel);
    if (!(await this.isVisible(closeButton))) {
      return;
    }

    await closeButton.click();
    await expect(this.page.getByTestId(ids.vehiclePanelDrawer)).toHaveAttribute("data-state", "closed", { timeout: 10_000 });
  }

  private async expectDemoTransportAvailable(): Promise<void> {
    await expect(this.transportSelect()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          this.transportSelect().locator("option").evaluateAll((options) =>
            options.map((option) => (option as HTMLOptionElement).value),
          ),
        { message: "Demo transport should be available from the real web platform", timeout: 15_000 },
      )
      .toContain("demo");
  }

  private async expectMetricNotPlaceholder(testId: string): Promise<void> {
    const metric = this.page.getByTestId(testId).first();
    await expect(metric).toBeVisible({ timeout: 20_000 });
    await expect(metric, `${testId} should contain real demo telemetry`).not.toContainText("--", { timeout: 20_000 });
  }

  private transportSelect(): Locator {
    return this.page.getByTestId(ids.transport);
  }

  private demoPreset(): Locator {
    return this.page.getByTestId(ids.demoPreset);
  }

  private connectButton(): Locator {
    return this.page.getByTestId(ids.connect);
  }

  private disconnectButton(): Locator {
    return this.page.getByTestId(ids.disconnect);
  }

  private async isVisible(locator: Locator): Promise<boolean> {
    try {
      return await locator.isVisible({ timeout: 500 });
    } catch {
      return false;
    }
  }
}
