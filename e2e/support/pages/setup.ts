import { expect, type Locator, type Page } from "@playwright/test";

import { safeParameterEditCandidates, setupSections, type ParameterEdit, type SetupSection } from "../data/setup";
import { expectLayoutTargetsReachable, noopLayoutAudit, type LayoutAudit } from "../layout";
import { fillAndBlur, isVisible } from "./utils";

const ids = {
  catalogRoot: "parameter-catalog-browser",
  inputPrefix: "parameter-workspace-input",
  itemPrefix: "parameter-workspace-item",
  metadata: "parameter-domain-metadata",
  overviewArmControl: "setup-workspace-overview-arm-control",
  overviewIdentity: "setup-workspace-overview-identity",
  overviewParameterActions: "setup-workspace-overview-parameter-actions",
  overviewPrearmSummary: "setup-workspace-overview-prearm-summary",
  overviewSafetyAudit: "setup-workspace-overview-safety-audit",
  overviewSection: "setup-workspace-overview-section",
  progress: "parameter-domain-progress",
  root: "parameter-workspace",
  scope: "parameter-domain-scope",
  search: "parameter-catalog-search",
  state: "parameter-workspace-state",
  reviewApply: "app-shell-parameter-review-apply",
  reviewCount: "app-shell-parameter-review-count",
  reviewRowPrefix: "app-shell-parameter-review-row",
  reviewSurface: "app-shell-parameter-review-surface",
  reviewToggle: "app-shell-parameter-review-toggle",
  reviewTray: "app-shell-parameter-review-tray",
  sectionDrawer: "setup-workspace-section-drawer",
  sectionDrawerToggle: "setup-workspace-section-drawer-toggle",
  osdEmpty: "setup-workspace-osd-empty",
  osdGrid: "setup-workspace-osd-grid",
  osdSection: "setup-workspace-osd-section",
  osdSetup: "setup-workspace-osd-setup",
  osdSetupProfileSelect: "setup-workspace-osd-setup-profile-select",
  osdSetupDisplayTargetSelect: "setup-workspace-osd-setup-display-target-select",
  osdSetupManualModeSelect: "setup-workspace-osd-setup-manual-mode-select",
  osdSetupManualGridSelect: "setup-workspace-osd-setup-manual-grid-select",
  osdSetupStageGridAction: "setup-workspace-osd-setup-stage-grid-action",
  osdDisplayCompatibilityWarning: "setup-workspace-osd-display-compatibility-warning",
  osdSetupStagedPrefix: "setup-workspace-osd-setup-staged",
  osdSetupTargetPrefix: "setup-workspace-osd-setup-target",
  osdSetupUartSelect: "setup-workspace-osd-setup-uart-select",
  osdSummary: "setup-workspace-osd-summary",
  vtolAssistInput: "setup-workspace-vtol-input-Q_ASSIST_SPEED",
  vtolAssistStaged: "setup-workspace-vtol-staged-Q_ASSIST_SPEED",
  vtolAirframe: "vtol-airframe-configurator",
  vtolFrameClass: "vtol-frame-class-select",
  vtolTopologyDiagram: "vtol-topology-diagram",
  motorsEscQueuedLayout: "setup-workspace-motors-esc-banner-queued-layout",
  motorsEscRowPrefix: "setup-workspace-motors-esc-row",
  outputsSection: "setup-workspace-outputs-section",
  outputsPropulsionSection: "setup-workspace-outputs-propulsion-section",
  outputsServoSection: "setup-workspace-outputs-servo-section",
  outputsFunctionRowPrefix: "setup-workspace-outputs-function-row",
  outputsFunctionOwnersPrefix: "setup-workspace-outputs-function-owners",
  outputsEditFunctionPrefix: "setup-workspace-outputs-edit-function",
  outputsOutputOptionPrefix: "setup-workspace-outputs-output-option",
  outputsReassignmentConfirmation: "setup-workspace-outputs-reassignment-confirmation",
  servoOutputsRowPrefix: "setup-workspace-servo-outputs-row",
} as const;

export class SetupWorkspacePage {
  constructor(
    private readonly page: Page,
    private readonly auditLayout: LayoutAudit = noopLayoutAudit,
  ) {}

  async ensureParametersDownloaded(): Promise<void> {
    await this.downloadParametersIfNeeded();
    await this.expectOverview();
  }

  async expectOverview(): Promise<void> {
    await expect(this.page.getByTestId(ids.overviewSection)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.overviewIdentity)).toBeVisible();
    await expect(this.page.getByTestId(ids.overviewParameterActions)).toBeVisible();
    await expect(this.page.getByTestId(ids.overviewPrearmSummary)).toBeVisible();
    await expect(this.page.getByTestId(ids.overviewArmControl)).toBeVisible();
    await expect(this.page.getByTestId(ids.overviewSafetyAudit)).toBeVisible();
    await expect(this.page.locator('[data-testid^="setup-workspace-overview-group-"]')).toHaveCount(0);
    await expect(this.page.locator('[data-testid^="setup-workspace-overview-action-"]')).toHaveCount(0);
    await this.auditLayout("setup overview");
  }

  async expectSectionsOpen(sections: readonly SetupSection[] = setupSections): Promise<void> {
    for (const section of sections) {
      await this.openSection(section);
    }
  }

  async stageFirstAvailableSafeParameterEdit(
    candidates: readonly string[] = safeParameterEditCandidates,
  ): Promise<ParameterEdit> {
    await this.openParameters();

    for (const name of candidates) {
      const input = await this.findParameterInput(name);
      if (!input) {
        continue;
      }

      const current = Number(await input.inputValue());
      if (!Number.isFinite(current)) {
        continue;
      }

      const next = Number((current + 1).toFixed(2));
      await input.fill(String(next));
      await input.blur();
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(1, { timeout: 10_000 });
      await this.auditLayout(`setup staged ${name}`);
      return { name, current, next };
    }

    throw new Error("No safe editable numeric demo parameter was found");
  }

  async stageRtlReturnAltitudeEdit(): Promise<ParameterEdit> {
    await this.openSectionById("rtl_return");
    const name = "RTL_ALTITUDE";
    const input = this.page.getByTestId("setup-workspace-rtl-return-input-RTL_ALTITUDE");
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toBeEnabled();

    const current = Number(await input.inputValue());
    if (!Number.isFinite(current)) {
      throw new Error(`RTL_ALT input has non-numeric value: ${await input.inputValue()}`);
    }

    const next = Number((current + 1).toFixed(2));
    await fillAndBlur(input, String(next));
    await expect(this.page.getByTestId("setup-workspace-rtl-return-staged-RTL_ALTITUDE")).toBeVisible({
      timeout: 10_000,
    });
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(1, { timeout: 10_000 });
    await this.auditLayout("setup staged RTL_ALTITUDE");
    return { name, current, next };
  }

  async stageVtolAssistSpeedEdit(): Promise<ParameterEdit> {
    await this.openSectionById("vtol");
    const name = "Q_ASSIST_SPEED";
    const input = this.page.getByTestId(ids.vtolAssistInput);
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toBeEnabled();

    const current = Number(await input.inputValue());
    if (!Number.isFinite(current) || current <= 0) {
      throw new Error(`Q_ASSIST_SPEED has an invalid automatic threshold: ${await input.inputValue()}`);
    }

    const next = Number(Math.max(0.1, current - 0.5).toFixed(1));
    await fillAndBlur(input, String(next));
    await expect(this.page.getByTestId(ids.vtolAssistStaged)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(1, { timeout: 10_000 });
    await this.auditLayout("setup staged Q_ASSIST_SPEED");
    return { name, current, next };
  }

  async expectStagedTriPreviewUsesAppliedMotorMap(): Promise<void> {
    await this.openSectionById("vtol");
    const airframe = this.page.getByTestId(ids.vtolAirframe);
    await expect(airframe).toBeVisible({ timeout: 10_000 });

    await this.page.getByTestId("vtol-output-assignment-status").getByRole("link", { name: "Open Outputs" }).click();
    const motorTestLink = this.page.getByRole("link", { name: "Motor test" }).first();
    const motorTestHref = await motorTestLink.getAttribute("href");
    const linkedMotor = motorTestHref?.match(/[?&]motor=(\d+)/)?.[1];
    if (!linkedMotor) {
      throw new Error(`VTOL motor link has no motor target: ${motorTestHref}`);
    }
    await motorTestLink.click();
    await expect(this.page.getByTestId(`${ids.motorsEscRowPrefix}-${linkedMotor}`)).toHaveAttribute(
      "data-selected",
      "true",
    );

    await this.openSectionById("vtol");
    await expect(airframe).toBeVisible({ timeout: 10_000 });
    await airframe.getByTestId(ids.vtolFrameClass).selectOption("7");

    const topology = this.page.getByTestId(ids.vtolTopologyDiagram);
    await expect(topology).toContainText("Proposed — not active");
    await expect(topology).toContainText("proposed Tri Standard Tri");
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-Q_FRAME_CLASS`)).toHaveCount(1, { timeout: 10_000 });

    await this.openSectionById("motors_esc");
    const pendingBanner = this.page.getByTestId(ids.motorsEscQueuedLayout);
    await expect(pendingBanner).toContainText("Pending VTOL topology");
    await expect(pendingBanner).toContainText("Tri Standard Tri");
    await expect(pendingBanner).toContainText("tests still use applied Quad X");

    await this.ensureReviewSurfaceVisible();
    await this.page.getByTestId("app-shell-parameter-review-discard-Q_FRAME_CLASS").click();
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-Q_FRAME_CLASS`)).toHaveCount(0);
    await this.auditLayout("setup proposed Tri and applied Quad motor map");
  }

  async expectUnifiedOutputsWorkflow(): Promise<void> {
    await this.openSectionById("vtol");
    const airframe = this.page.getByTestId(ids.vtolAirframe);
    await expect(airframe).toBeVisible({ timeout: 10_000 });
    await airframe.getByTestId("vtol-architecture-select").selectOption("tiltrotor");

    const outputStatus = this.page.getByTestId("vtol-output-assignment-status");
    await expect(outputStatus).toBeVisible();
    await outputStatus.getByRole("link", { name: "Open Outputs" }).click();
    await expect(this.page).toHaveURL(/\/setup\/outputs\?mode=assign/);
    await expect(this.page.getByTestId(ids.outputsSection)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.outputsPropulsionSection)).toBeVisible();
    await expect(this.page.getByTestId(ids.outputsServoSection)).toBeVisible();
    await expect(this.page.getByTestId(`${ids.outputsFunctionRowPrefix}-33`)).toBeVisible();
    await this.page
      .getByTestId(ids.outputsServoSection)
      .getByRole("button", { name: "Add function", exact: true })
      .click();
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /Tilt motors front/ })
      .click();
    await expect(this.page.getByTestId(`${ids.outputsFunctionRowPrefix}-41`)).toBeVisible();
    await expect(this.page.getByTestId(`${ids.outputsFunctionRowPrefix}-4`)).toBeVisible();
    await expect(this.page.getByTestId(`${ids.outputsFunctionRowPrefix}-19`)).toBeVisible();
    const servo = this.page.getByTestId("setup-workspace-output-settings-1");
    await expect(servo.getByTestId("setup-workspace-output-reversed-1")).toBeVisible();
    for (const point of ["min", "mid", "max"]) {
      await expect(servo.getByTestId(`setup-workspace-output-${point}-1`)).toBeVisible();
      await expect(servo.getByTestId(`setup-workspace-output-${point}-1-slider`).getByRole("slider")).toBeVisible();
    }
    await this.auditLayout("setup unified output assignments");

    await this.page.getByTestId(`${ids.outputsEditFunctionPrefix}-4`).click();
    await expect(this.page.getByTestId(`${ids.outputsOutputOptionPrefix}-1`)).toHaveCount(0);
    await this.page.getByTestId(`${ids.outputsOutputOptionPrefix}-9`).click();
    await this.ensureReviewSurfaceVisible();
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-SERVO9_FUNCTION`)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(`${ids.outputsFunctionOwnersPrefix}-4`)).toContainText("SERVO1");
    await expect(this.page.getByTestId(`${ids.outputsFunctionOwnersPrefix}-4`)).toContainText("SERVO9");

    const aileron = this.page.getByTestId(`${ids.outputsFunctionRowPrefix}-4`);
    await aileron.getByRole("button", { name: "Remove SERVO9 from Aileron", exact: true }).click();
    await expect(this.page.getByTestId("setup-workspace-output-settings-9")).toHaveCount(0);
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-SERVO9_FUNCTION`)).toHaveCount(0);
    await this.page.getByTestId(`${ids.outputsEditFunctionPrefix}-4`).click();
    await this.page.getByTestId(`${ids.outputsOutputOptionPrefix}-9`).click();
    await expect(this.page.getByTestId("setup-workspace-output-settings-9")).toBeVisible();

    await this.page.getByTestId(`${ids.outputsEditFunctionPrefix}-4`).click();
    await this.page.getByTestId(`${ids.outputsOutputOptionPrefix}-2`).click();
    const confirmation = this.page.getByTestId(ids.outputsReassignmentConfirmation);
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("SERVO2: Elevator → Aileron");
    await confirmation
      .locator("xpath=..")
      .getByRole("button", { name: /Stage 1 change/ })
      .click();
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-SERVO2_FUNCTION`)).toBeVisible({ timeout: 10_000 });

    await this.page.getByRole("link", { name: "Servo test", exact: true }).first().click();
    await expect(this.page).toHaveURL(/\/setup\/outputs\?mode=test/);
    const elevatorTest = this.page.getByTestId(`${ids.servoOutputsRowPrefix}-2`);
    await expect(this.page.getByTestId("setup-workspace-servo-outputs-function-group-19")).toContainText("Elevator");
    await expect(elevatorTest).toContainText("SERVO2");
    await expect(elevatorTest.getByRole("button", { name: /Send Mid/ })).toBeDisabled();
    await expect(elevatorTest.getByRole("slider", { name: "SERVO2 PWM" })).toHaveAttribute("aria-disabled", "true");
    await this.page.getByTestId("setup-workspace-servo-outputs-unlock").click();
    const pwmSlider = elevatorTest.getByRole("slider", { name: "SERVO2 PWM" });
    await pwmSlider.focus();
    await pwmSlider.press("ArrowRight");
    await expect(elevatorTest.getByRole("alert")).toContainText("command=183, result=unsupported");
    await expect(this.page.getByTestId("setup-workspace-servo-outputs-raw-input-2")).toHaveValue("1501");
    await this.page.getByTestId("setup-workspace-servo-outputs-unlock").click();
    await this.auditLayout("setup output servo test");

    await this.ensureReviewSurfaceVisible();
    for (const name of ["SERVO2_FUNCTION", "SERVO9_FUNCTION", "Q_TILT_ENABLE"]) {
      const discard = this.page.getByTestId(`app-shell-parameter-review-discard-${name}`);
      if (await isVisible(discard)) await discard.click();
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(0);
    }
  }

  async stageServoOutputEdits(): Promise<ParameterEdit[]> {
    await this.openSectionById("outputs");
    const servo = this.page.getByTestId("setup-workspace-output-settings-1");
    await expect(servo).toBeVisible();
    const edits: ParameterEdit[] = [];
    const mid = servo.getByTestId("setup-workspace-output-mid-1");
    const appliedMid = Number(await mid.inputValue());
    const min = servo.getByTestId("setup-workspace-output-min-1");
    const appliedMin = Number(await min.inputValue());
    await min.fill(String(appliedMid + 1));
    await expect(min).toHaveAttribute("aria-invalid", "true");
    await expect(servo.getByRole("alert")).toContainText("Keep Min ≤ Mid ≤ Max");
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-SERVO1_MIN`)).toHaveCount(0);

    for (const [point, suffix, delta] of [
      ["min", "MIN", 10],
      ["max", "MAX", -10],
    ] as const) {
      const input = servo.getByTestId(`setup-workspace-output-${point}-1`);
      const current = point === "min" ? appliedMin : Number(await input.inputValue());
      const next = current + delta;
      await fillAndBlur(input, String(next));
      await expect(input).toHaveValue(String(next));
      await expect(input).not.toHaveAttribute("aria-invalid", "true");
      edits.push({ name: `SERVO1_${suffix}`, current, next });
    }
    const midSlider = servo.getByTestId("setup-workspace-output-mid-1-slider").getByRole("slider");
    await midSlider.focus();
    await midSlider.press("ArrowRight");
    await expect(mid).toHaveValue(String(appliedMid + 1));
    edits.push({ name: "SERVO1_TRIM", current: appliedMid, next: appliedMid + 1 });

    const reverse = servo.getByTestId("setup-workspace-output-reversed-1");
    const currentReverse = (await reverse.getAttribute("aria-checked")) === "true" ? 1 : 0;
    await reverse.click();
    await expect(reverse).toHaveAttribute("aria-checked", currentReverse === 1 ? "false" : "true");
    edits.push({ name: "SERVO1_REVERSED", current: currentReverse, next: currentReverse === 1 ? 0 : 1 });
    await this.expectReviewContains(edits.map(({ name }) => name));
    await this.auditLayout("setup expanded servo PWM settings");
    return edits;
  }

  async expectDisabledOsdWithoutLayoutParameters(): Promise<void> {
    await this.openSectionById("osd");
    await expect(this.page.getByTestId(ids.osdSection)).toBeVisible({ timeout: 15_000 });
    await expect(this.page.getByTestId(ids.osdSummary)).toBeVisible();
    const guide = this.osdSetupGuide();
    await expect(guide).toBeVisible();
    await expect(guide.getByTestId(ids.osdSetupProfileSelect)).toHaveValue("");
    await expect(guide.getByText("OSD disabled (OSD_TYPE=0)")).toBeVisible();
    await expect(guide.getByText("No OSD profile selected")).toBeVisible();
    await expect(this.osdStageButton()).toBeDisabled();
    await expect(this.page.getByTestId(ids.osdEmpty)).toBeVisible();
    await expect(this.page.getByTestId(ids.osdEmpty)).toContainText("No OSD parameters detected");
    await expect(this.page.getByTestId(ids.osdGrid)).toHaveCount(0);
    await this.auditLayout("setup OSD disabled and empty");
  }

  async stageAnalogOsdSetup(): Promise<void> {
    const guide = this.osdSetupGuide();
    await guide.getByTestId(ids.osdSetupProfileSelect).selectOption("analog");
    await expect(guide.getByRole("heading", { name: "Analog" })).toBeVisible();

    const osdTypeTarget = guide.getByTestId(`${ids.osdSetupTargetPrefix}-OSD_TYPE`);
    await expect(osdTypeTarget).toBeVisible();
    await expect(osdTypeTarget).toContainText("0 → 1");
    await expect(this.osdStageButton()).toBeEnabled();

    await this.osdStageButton().click();
    await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-OSD_TYPE`)).toHaveCount(1, { timeout: 10_000 });
    await expect(guide.getByTestId(`${ids.osdSetupStagedPrefix}-OSD_TYPE`)).toBeVisible();
    await this.auditLayout("setup OSD analog transaction staged");
  }

  async expectDigitalOsdRequiresUart(): Promise<void> {
    const guide = this.osdSetupGuide();
    await guide.getByTestId(ids.osdSetupProfileSelect).selectOption("dji");
    await expect(guide.getByTestId(ids.osdSetupUartSelect)).toHaveValue("");
    await expect(guide.getByText("Select the UART wired to the video system.")).toBeVisible();
    await expect(this.osdStageButton()).toBeDisabled();
    await this.auditLayout("setup OSD digital UART required");
  }

  async expectReviewContains(names: string[]): Promise<void> {
    await expect(this.page.getByTestId(ids.reviewTray)).toBeVisible({ timeout: 10_000 });
    await expect(this.page.getByTestId(ids.reviewCount)).toContainText(/parameter/i);
    await this.ensureReviewSurfaceVisible();

    for (const name of names) {
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toBeVisible();
    }
    await this.auditLayout("setup parameter review");
  }

  async applyStagedParameters(names: string[]): Promise<void> {
    await this.ensureReviewSurfaceVisible();
    await this.page.getByTestId(ids.reviewApply).click();
    for (const name of names) {
      await expect(this.page.getByTestId(`${ids.reviewRowPrefix}-${name}`)).toHaveCount(0, { timeout: 45_000 });
    }
    await expect(this.page.getByTestId(ids.reviewTray)).toHaveCount(0, { timeout: 10_000 });
    await this.auditLayout("setup parameters applied");
  }

  async reloadParametersFromVehicle(): Promise<void> {
    await this.openSection(setupSections[0]);
    await this.expectOverview();
    const refresh = this.page.getByRole("button", { name: "Refresh all" });
    await expect(refresh).toBeEnabled({ timeout: 10_000 });
    await refresh.click();
    await expect(this.page.getByRole("button", { name: "Refresh all" })).toBeVisible({ timeout: 45_000 });
    await this.auditLayout("setup parameters reloaded");
  }

  async expectParameterValue(name: string, expected: number): Promise<void> {
    await this.openParameters();
    const input = await this.findParameterInput(name);
    if (!input) {
      throw new Error(`Parameter ${name} disappeared after reload`);
    }

    await expect
      .poll(
        async () => {
          if ((await input.getAttribute("role")) === "switch") {
            return (await input.getAttribute("aria-checked")) === "true" ? 1 : 0;
          }
          return Number(await input.inputValue());
        },
        { timeout: 10_000 },
      )
      .toBeCloseTo(expected, 2);
    await this.auditLayout(`setup parameter ${name} value`);
  }

  async expectPrimaryActionsReachable(label = "setup"): Promise<void> {
    await expectLayoutTargetsReachable(this.page, label, [
      { label: "overview section", locator: this.page.getByTestId(ids.overviewSection) },
      { label: "active configuration", locator: this.page.getByTestId(ids.overviewIdentity) },
      { label: "pre-arm readiness", locator: this.page.getByTestId(ids.overviewPrearmSummary) },
      {
        label: "refresh parameters",
        locator: this.page.getByRole("button", { name: "Refresh all" }),
        requireEnabled: true,
      },
    ]);
  }

  async openSection(section: SetupSection): Promise<void> {
    const navLink = this.page.getByTestId(`setup-workspace-nav-${section.id}`);
    if (!(await isVisible(navLink))) {
      await this.page.getByTestId(ids.sectionDrawerToggle).click();
      await expect(this.page.getByTestId(ids.sectionDrawer)).toHaveAttribute("data-open", "true", { timeout: 10_000 });
      await this.auditLayout("setup section drawer open");
    }

    await navLink.click();
    const sectionRoot = this.page.getByTestId(section.testId);
    await expect(sectionRoot, `${section.label} should open`).toBeVisible({
      timeout: 15_000,
    });
    if (section.id === "arming") {
      await expect(sectionRoot.getByTestId("setup-workspace-arming-check-checklist")).toBeVisible();
      await expect(sectionRoot.getByRole("button", { name: /^(Arm|Disarm)$/ })).toHaveCount(0);
    }
    await this.auditLayout(`setup section ${section.id}`);
  }

  private async openSectionById(sectionId: SetupSection["id"]): Promise<void> {
    const section = setupSections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      throw new Error(`Setup section ${sectionId} is not defined`);
    }
    await this.openSection(section);
  }

  private async ensureReviewSurfaceVisible(): Promise<void> {
    const surface = this.page.getByTestId(ids.reviewSurface);
    if (!(await isVisible(surface))) {
      await this.page.getByTestId(ids.reviewToggle).click();
    }
    await expect(surface).toBeVisible();
    await this.auditLayout("setup review surface visible");
  }

  private osdSetupGuide(): Locator {
    return this.page.getByTestId(ids.osdSetup);
  }

  private osdStageButton(): Locator {
    return this.osdSetupGuide().getByRole("button", { name: "Stage OSD setup" });
  }

  private async downloadParametersIfNeeded(): Promise<void> {
    const overview = this.page.getByTestId(ids.overviewSection);
    if (await isVisible(overview)) {
      return;
    }

    const downloadButton = this.page.getByRole("button", { name: "Download parameters" });
    if (!(await isVisible(downloadButton))) {
      return;
    }

    await downloadButton.click();
    await expect(overview).toBeVisible({ timeout: 45_000 });
  }

  private async openParameters(): Promise<void> {
    const parameters = setupSections.find((section) => section.id === "parameters");
    if (!parameters) {
      throw new Error("Parameters setup section is not defined");
    }

    await this.openSection(parameters);
    await expect(this.page.getByTestId(ids.root)).toBeVisible();
    await expect(this.page.getByTestId(ids.state)).toBeVisible();
    await expect(this.page.getByTestId(ids.scope)).toContainText(/live|session|vehicle|none/i);
    await expect(this.page.getByTestId(ids.progress)).toBeVisible();
    await expect(this.page.getByTestId(ids.metadata)).toBeVisible();
    await expect(this.page.getByTestId(ids.catalogRoot)).toBeVisible();
    await this.page.getByRole("button", { name: "All", exact: true }).click();
  }

  private async findParameterInput(name: string): Promise<Locator | null> {
    const search = this.page.getByTestId(ids.search);
    await search.fill(name);
    const group = this.page.getByTestId(`parameter-catalog-group-${name.split("_")[0]}`);
    const row = this.page.getByTestId(`${ids.itemPrefix}-${name}`);
    try {
      await expect(group).toBeVisible({ timeout: 2500 });
      if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
      await expect(row).toBeVisible({ timeout: 2500 });
    } catch {
      return null;
    }

    const input = this.page.getByTestId(`${ids.inputPrefix}-${name}`);
    if (!(await isVisible(input)) || !(await input.isEnabled())) {
      return null;
    }
    return input;
  }
}
