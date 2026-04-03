import { test as base, expect, type Page } from "@playwright/test";
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
} as const;

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
  getLiveEnvelope: () => Promise<{ session_id: string; source_kind: "live" | "playback"; seek_epoch: number; reset_revision: number } | null>;
  waitForRuntimeSurface: () => Promise<void>;
};

type Fixtures = {
  mockPlatform: MockPlatformFixture;
};

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
