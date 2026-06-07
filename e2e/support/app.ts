import type { Page } from "@playwright/test";

import { expectLayoutClean, type LayoutAudit } from "./layout";
import { ConnectionPage, type DemoVehiclePreset } from "./pages/connection";
import { FirmwareWorkspacePage } from "./pages/firmware";
import { HudWorkspacePage } from "./pages/hud";
import { LogsWorkspacePage } from "./pages/logs";
import { MissionWorkspacePage } from "./pages/mission";
import { OverviewWorkspacePage } from "./pages/overview";
import { SettingsWorkspacePage } from "./pages/settings";
import { SetupWorkspacePage } from "./pages/setup";
import { TelemetryWorkspacePage } from "./pages/telemetry";
import { ShellPage, type WorkspaceKey } from "./pages/shell";

type AppOptions = {
  expectedTier?: string;
};

export class IronWingApp {
  readonly connection: ConnectionPage;
  readonly firmware: FirmwareWorkspacePage;
  readonly hud: HudWorkspacePage;
  readonly logs: LogsWorkspacePage;
  readonly mission: MissionWorkspacePage;
  readonly overview: OverviewWorkspacePage;
  readonly settings: SettingsWorkspacePage;
  readonly setup: SetupWorkspacePage;
  readonly shell: ShellPage;
  readonly telemetry: TelemetryWorkspacePage;
  private readonly audit: LayoutAudit;

  constructor(
    readonly page: Page,
    private readonly options: AppOptions = {},
  ) {
    this.audit = (label) => this.auditLayout(label);
    this.connection = new ConnectionPage(page, this.audit);
    this.firmware = new FirmwareWorkspacePage(page, this.audit);
    this.hud = new HudWorkspacePage(page, this.audit);
    this.logs = new LogsWorkspacePage(page, this.audit);
    this.mission = new MissionWorkspacePage(page, this.audit);
    this.overview = new OverviewWorkspacePage(page, this.audit);
    this.settings = new SettingsWorkspacePage(page, this.audit);
    this.setup = new SetupWorkspacePage(page, this.audit);
    this.shell = new ShellPage(page, this.audit);
    this.telemetry = new TelemetryWorkspacePage(page, this.audit);
  }

  async open(path = "/"): Promise<void> {
    await this.page.goto(path);
    await this.shell.expectReady();
    if (this.options.expectedTier) {
      await this.shell.expectTier(this.options.expectedTier);
    }
    await this.auditLayout(`open ${path}`);
  }

  async connectDemo(preset: DemoVehiclePreset = "quadcopter"): Promise<void> {
    await this.connection.connectDemo(preset);
    await this.shell.expectLiveSession();
    await this.auditLayout(`connect demo ${preset}`);
  }

  async openAndConnectDemo(preset: DemoVehiclePreset = "quadcopter"): Promise<void> {
    await this.open("/");
    await this.connectDemo(preset);
  }

  async navigateTo(workspace: WorkspaceKey): Promise<void> {
    await this.shell.navigateTo(workspace);
  }

  async auditLayout(label: string): Promise<void> {
    await expectLayoutClean(this.page, label);
  }
}
