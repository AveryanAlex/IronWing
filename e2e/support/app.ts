import type { Page } from "@playwright/test";

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

  constructor(readonly page: Page) {
    this.connection = new ConnectionPage(page);
    this.firmware = new FirmwareWorkspacePage(page);
    this.hud = new HudWorkspacePage(page);
    this.logs = new LogsWorkspacePage(page);
    this.mission = new MissionWorkspacePage(page);
    this.overview = new OverviewWorkspacePage(page);
    this.settings = new SettingsWorkspacePage(page);
    this.setup = new SetupWorkspacePage(page);
    this.shell = new ShellPage(page);
    this.telemetry = new TelemetryWorkspacePage(page);
  }

  async open(path = "/"): Promise<void> {
    await this.page.goto(path);
    await this.shell.expectReady();
  }

  async connectDemo(preset: DemoVehiclePreset = "quadcopter"): Promise<void> {
    await this.connection.connectDemo(preset);
    await this.shell.expectLiveSession();
  }

  async openAndConnectDemo(preset: DemoVehiclePreset = "quadcopter"): Promise<void> {
    await this.open("/");
    await this.connectDemo(preset);
  }

  async navigateTo(workspace: WorkspaceKey): Promise<void> {
    await this.shell.navigateTo(workspace);
  }
}
