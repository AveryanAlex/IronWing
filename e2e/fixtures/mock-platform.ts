import { test as base, expect, type Locator, type Page } from "@playwright/test";
import type {
  MockCommandBehavior,
  MockGuidedStateValue,
  MockInvocation,
  MockLiveVehicleState,
  MockMissionState,
  MockPlatformEvent,
  MockParamProgressState,
  MockParamStoreState,
} from "../../src/platform/mock/backend";

export const runtimeSelectors = {
  shell: '[data-testid="app-shell"]',
  heading: '[data-testid="app-shell-heading"]',
  runtimeMarker: '[data-testid="app-runtime-marker"]',
  framework: '[data-testid="app-runtime-framework"]',
  bootstrapState: '[data-testid="app-bootstrap-state"]',
  bootedAt: '[data-testid="app-runtime-booted-at"]',
  entrypoint: '[data-testid="app-runtime-entrypoint"]',
  quarantineBoundary: '[data-testid="app-runtime-quarantine-boundary"]',
  bootstrapFailure: '[data-testid="app-bootstrap-failure"]',
  bootstrapFailureMessage: '[data-testid="app-bootstrap-failure-message"]',
  shellTier: '[data-testid="app-shell-tier"]',
  drawerState: '[data-testid="app-shell-drawer-state"]',
  vehiclePanelButton: '[data-testid="app-shell-vehicle-panel-btn"]',
  vehiclePanelDrawer: '[data-testid="app-shell-vehicle-panel-drawer"]',
  vehiclePanelClose: '[data-testid="app-shell-vehicle-panel-close"]',
} as const;

export const connectionSelectors = {
  statusText: '[data-testid="connection-status-text"]',
  transportSelect: '[data-testid="connection-transport-select"]',
  tcpAddress: '[data-testid="connection-tcp-address"]',
  connectButton: '[data-testid="connection-connect-btn"]',
  cancelButton: '[data-testid="connection-cancel-btn"]',
  disconnectButton: '[data-testid="connection-disconnect-btn"]',
  errorMessage: '[data-testid="connection-error-message"]',
  diagnosticsLastPhase: '[data-testid="connection-diagnostics-last-phase"]',
  diagnosticsActiveSource: '[data-testid="connection-diagnostics-active-source"]',
  diagnosticsEnvelope: '[data-testid="connection-diagnostics-envelope"]',
  diagnosticsBootstrap: '[data-testid="connection-diagnostics-bootstrap"]',
} as const;

export const liveSurfaceSelectors = {
  stateValue: '[data-testid="telemetry-state-value"]',
  modeValue: '[data-testid="telemetry-mode-value"]',
  altitudeValue: '[data-testid="telemetry-alt-value"]',
  speedValue: '[data-testid="telemetry-speed-value"]',
  batteryValue: '[data-testid="telemetry-battery-value"]',
  headingValue: '[data-testid="telemetry-heading-value"]',
  gpsText: '[data-testid="telemetry-gps-text"]',
} as const;

export const parameterWorkspaceSelectors = {
  workspaceButton: '[data-testid="app-shell-parameter-workspace-btn"]',
  root: '[data-testid="parameter-workspace"]',
  state: '[data-testid="parameter-workspace-state"]',
  scope: '[data-testid="parameter-domain-scope"]',
  progress: '[data-testid="parameter-domain-progress"]',
  metadata: '[data-testid="parameter-domain-metadata"]',
  notice: '[data-testid="parameter-domain-notice"]',
  pendingCount: '[data-testid="parameter-workspace-pending-count"]',
  reviewTray: '[data-testid="app-shell-parameter-review-tray"]',
  reviewSurface: '[data-testid="app-shell-parameter-review-surface"]',
  reviewCount: '[data-testid="app-shell-parameter-review-count"]',
  reviewSummary: '[data-testid="app-shell-parameter-review-summary"]',
  reviewProgress: '[data-testid="app-shell-parameter-review-progress"]',
  reviewWarning: '[data-testid="app-shell-parameter-review-warning"]',
  reviewToggle: '[data-testid="app-shell-parameter-review-toggle"]',
  reviewApply: '[data-testid="app-shell-parameter-review-apply"]',
} as const;

export const shellViewportPresets = {
  desktop: {
    width: 1440,
    height: 900,
    tier: "wide",
    drawerState: "docked",
    label: "desktop shell",
  },
  radiomaster: {
    width: 1280,
    height: 720,
    tier: "wide",
    drawerState: "docked",
    label: "Radiomaster 1280x720 shell",
  },
  phone: {
    width: 390,
    height: 844,
    tier: "phone",
    drawerState: "closed",
    label: "phone shell",
  },
} as const;

export type ShellViewportPresetName = keyof typeof shellViewportPresets;
export type ShellViewportPreset = (typeof shellViewportPresets)[ShellViewportPresetName];

type MockPlatformFixture = {
  reset: () => Promise<void>;
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
  clearCommandBehavior: (cmd: string) => Promise<void>;
  resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => Promise<boolean>;
  rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => Promise<boolean>;
  emit: (event: string, payload: unknown) => Promise<void>;
  emitLiveSessionState: (vehicleState: MockLiveVehicleState) => Promise<void>;
  emitMissionState: (missionState: MockMissionState) => Promise<void>;
  emitParamStore: (paramStore: MockParamStoreState) => Promise<void>;
  emitParamProgress: (paramProgress: MockParamProgressState) => Promise<void>;
  emitLiveGuidedState: (guidedState: MockGuidedStateValue) => Promise<void>;
  resolveDeferredConnectLink: (params: {
    vehicleState: MockLiveVehicleState;
    missionState?: MockMissionState;
    paramStore?: MockParamStoreState;
    paramProgress?: MockParamProgressState;
    guidedState: MockGuidedStateValue;
  }) => Promise<boolean>;
  getInvocations: () => Promise<MockInvocation[]>;
  getLiveEnvelope: () => Promise<{
    session_id: string;
    source_kind: "live" | "playback";
    seek_epoch: number;
    reset_revision: number;
  } | null>;
  waitForRuntimeSurface: () => Promise<void>;
};

type Fixtures = {
  mockPlatform: MockPlatformFixture;
};

function resolveShellViewportPreset(presetName: ShellViewportPresetName): ShellViewportPreset {
  const preset = shellViewportPresets[presetName];
  if (!preset) {
    throw new Error(
      `Unsupported shell viewport preset: ${presetName}. Use one of: ${Object.keys(shellViewportPresets).join(", ")}.`,
    );
  }
  return preset;
}

async function waitForMockController(page: Page) {
  await page.waitForFunction(() => Boolean(window.__IRONWING_MOCK_PLATFORM__), undefined, {
    timeout: 10_000,
  });
}

async function waitForRuntimeSurface(page: Page) {
  await page.waitForFunction(
    (selectors) => Boolean(document.querySelector(selectors.shell) || document.querySelector(selectors.bootstrapFailure)),
    runtimeSelectors,
    {
      timeout: 10_000,
    },
  );
}

async function withMockController<T>(page: Page, callback: string, ...args: unknown[]) {
  await waitForMockController(page);

  return page.evaluate(
    ([methodName, values]) => {
      const controller = window.__IRONWING_MOCK_PLATFORM__;
      if (!controller) {
        throw new Error("Mock platform controller is not available");
      }

      const method = controller[methodName as keyof typeof controller] as (...methodArgs: unknown[]) => T;
      return method(...values);
    },
    [callback, args],
  );
}

export async function assertShellViewport(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
  const preset = resolveShellViewportPreset(presetName);

  await expect
    .poll(() => page.viewportSize()?.width ?? 0, {
      message: `${preset.label} should apply width ${preset.width}px before shell assertions continue.`,
    })
    .toBe(preset.width);
  await expect
    .poll(() => page.viewportSize()?.height ?? 0, {
      message: `${preset.label} should apply height ${preset.height}px before shell assertions continue.`,
    })
    .toBe(preset.height);
  await expect
    .poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })), {
      message: `${preset.label} should reach the app with the same viewport dimensions Playwright set.`,
    })
    .toEqual({ width: preset.width, height: preset.height });

  return preset;
}

export async function applyShellViewport(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
  const preset = resolveShellViewportPreset(presetName);
  await page.setViewportSize({ width: preset.width, height: preset.height });
  await assertShellViewport(page, presetName);
  return preset;
}

export async function expectRuntimeDiagnostics(page: Page): Promise<void> {
  await expect(
    page.locator(runtimeSelectors.shell),
    "The active runtime shell did not mount; runtime diagnostics should stay available under the shared shell test ids.",
  ).toHaveAttribute("data-runtime-phase", "ready");
  await expect(page.locator(runtimeSelectors.framework)).toContainText("Svelte 5");
  await expect(page.locator(runtimeSelectors.bootstrapState)).toContainText("ready");
  await expect(page.locator(runtimeSelectors.bootedAt)).not.toContainText("Starting up");
  await expect(page.locator(runtimeSelectors.entrypoint)).toContainText("src/app/App.svelte");
  await expect(page.locator(runtimeSelectors.quarantineBoundary)).toContainText("src-old/runtime");
}

export async function expectShellChrome(page: Page, presetName: ShellViewportPresetName): Promise<ShellViewportPreset> {
  const preset = await assertShellViewport(page, presetName);

  await expect(
    page.locator(runtimeSelectors.shellTier),
    `${preset.label} should report the ${preset.tier} shell tier through the shared shell diagnostics card.`,
  ).toContainText(preset.tier);
  await expect(
    page.locator(runtimeSelectors.drawerState),
    `${preset.label} should report the ${preset.drawerState} vehicle-panel state through the shared shell diagnostics card.`,
  ).toContainText(preset.drawerState);

  return preset;
}

export function liveSurfaceLocator(page: Page, selector: keyof typeof liveSurfaceSelectors): Locator {
  return page.locator(liveSurfaceSelectors[selector]);
}

export function parameterInputLocator(page: Page, name: string): Locator {
  return page.locator(`[data-testid="parameter-workspace-input-${name}"]`);
}

export function parameterStageButtonLocator(page: Page, name: string): Locator {
  return page.locator(`[data-testid="parameter-workspace-stage-btn-${name}"]`);
}

export function parameterReviewRowLocator(page: Page, name: string): Locator {
  return page.locator(`[data-testid="app-shell-parameter-review-row-${name}"]`);
}

export function parameterReviewFailureLocator(page: Page, name: string): Locator {
  return page.locator(`[data-testid="app-shell-parameter-review-failure-${name}"]`);
}

export function parameterReviewRetryLocator(page: Page, name: string): Locator {
  return page.locator(`[data-testid="app-shell-parameter-review-retry-${name}"]`);
}

export async function openParameterWorkspace(page: Page): Promise<void> {
  const workspaceButton = page.locator(parameterWorkspaceSelectors.workspaceButton);
  await expect(
    workspaceButton,
    "Parameter workspace entry point is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the shell header.",
  ).toBeVisible();
  await workspaceButton.click();
  await expect(
    page.locator(parameterWorkspaceSelectors.root),
    "Parameter workspace did not mount after selecting Setup.",
  ).toBeVisible();
}

export async function stageParameterValue(page: Page, name: string, value: string): Promise<void> {
  const input = parameterInputLocator(page, name);
  const stageButton = parameterStageButtonLocator(page, name);

  await expect(
    input,
    `Parameter input ${name} is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the workspace markup.`,
  ).toBeVisible();
  await input.fill(value);
  await expect(
    stageButton,
    `Stage button for ${name} is missing; keep the shared selectors in e2e/fixtures/mock-platform.ts aligned with the workspace markup.`,
  ).toBeVisible();
  await stageButton.click();
}

export async function expectDockedVehiclePanel(page: Page, presetName: Extract<ShellViewportPresetName, "desktop" | "radiomaster">): Promise<void> {
  const preset = await expectShellChrome(page, presetName);

  await expect(
    page.locator(runtimeSelectors.vehiclePanelButton),
    `${preset.label} should not render the phone-only Vehicle panel drawer button.`,
  ).toHaveCount(0);
  await expect(
    page.locator(connectionSelectors.connectButton),
    `${preset.label} should keep the connection surface docked and immediately reachable.`,
  ).toBeVisible();
}

export async function openVehiclePanelDrawer(page: Page): Promise<void> {
  const drawerButton = page.getByRole("button", { name: "Vehicle panel" });
  const drawer = page.locator(runtimeSelectors.vehiclePanelDrawer);
  const connectButton = page.locator(connectionSelectors.connectButton);

  await expect(
    drawerButton,
    "Phone tier must expose a Vehicle panel button; if this fails, update the shared shell selectors in e2e/fixtures/mock-platform.ts instead of hard-coding coordinates in the spec.",
  ).toBeVisible();
  await expect(
    connectButton,
    "Phone tier should keep the connection surface out of reach until the Vehicle panel drawer is opened.",
  ).toHaveCount(0);

  await drawerButton.click();

  await expect(
    drawer,
    "Opening the Vehicle panel should switch the shared shell drawer into the open state.",
  ).toHaveAttribute("data-state", "open");
  await expect(
    page.locator(runtimeSelectors.drawerState),
    "Opening the Vehicle panel should update the shell diagnostics card to the open state.",
  ).toContainText("open");
  await expect(
    connectButton,
    "Vehicle panel drawer opened, but the connection surface is still unreachable. Keep selectors in e2e/fixtures/mock-platform.ts aligned with the shell.",
  ).toBeVisible();
}

export async function closeVehiclePanelDrawer(page: Page): Promise<void> {
  const drawer = page.locator(runtimeSelectors.vehiclePanelDrawer);
  const closeButton = page.locator(runtimeSelectors.vehiclePanelClose);

  await expect(
    closeButton,
    "Phone drawer close control is missing; keep the shared shell selectors in e2e/fixtures/mock-platform.ts aligned with the drawer markup.",
  ).toBeVisible();
  await closeButton.click();
  await expect(drawer, "Closing the Vehicle panel should collapse the drawer surface.").toHaveAttribute(
    "data-state",
    "closed",
  );
  await expect(
    page.locator(runtimeSelectors.drawerState),
    "Closing the Vehicle panel should update the shell diagnostics card to the closed state.",
  ).toContainText("closed");
}

export const test = base.extend<Fixtures>({
  mockPlatform: async ({ page }, use) => {
    await use({
      reset: () => withMockController(page, "reset"),
      setCommandBehavior: (cmd, behavior) => withMockController(page, "setCommandBehavior", cmd, behavior),
      clearCommandBehavior: (cmd) => withMockController(page, "clearCommandBehavior", cmd),
      resolveDeferred: (cmd, result, emit) => withMockController(page, "resolveDeferred", cmd, result, emit ?? []),
      rejectDeferred: (cmd, error, emit) => withMockController(page, "rejectDeferred", cmd, error, emit ?? []),
      emit: (event, payload) => withMockController(page, "emit", event, payload),
      emitLiveSessionState: (vehicleState) => withMockController(page, "emitLiveSessionState", vehicleState),
      emitMissionState: (missionState) => withMockController(page, "emitMissionState", missionState),
      emitParamStore: (paramStore) => withMockController(page, "emitParamStore", paramStore),
      emitParamProgress: (paramProgress) => withMockController(page, "emitParamProgress", paramProgress),
      emitLiveGuidedState: (guidedState) => withMockController(page, "emitLiveGuidedState", guidedState),
      resolveDeferredConnectLink: (params) => withMockController(page, "resolveDeferredConnectLink", params),
      getInvocations: () => withMockController(page, "getInvocations"),
      getLiveEnvelope: () => withMockController(page, "getLiveEnvelope"),
      waitForRuntimeSurface: () => waitForRuntimeSurface(page),
    });
  },
});

export { expect };
