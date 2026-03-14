import { test as base, expect, type Page } from "@playwright/test";
import type {
  MockCommandBehavior,
  MockInvocation,
  MockPlatformEvent,
} from "../../src/platform/mock/backend";

type MockPlatformFixture = {
  reset: () => Promise<void>;
  setCommandBehavior: (cmd: string, behavior: MockCommandBehavior) => Promise<void>;
  clearCommandBehavior: (cmd: string) => Promise<void>;
  resolveDeferred: (cmd: string, result?: unknown, emit?: MockPlatformEvent[]) => Promise<boolean>;
  rejectDeferred: (cmd: string, error: string, emit?: MockPlatformEvent[]) => Promise<boolean>;
  emit: (event: string, payload: unknown) => Promise<void>;
  getInvocations: () => Promise<MockInvocation[]>;
};

type Fixtures = {
  mockPlatform: MockPlatformFixture;
};

function withMockController<T>(page: Page, callback: string, ...args: unknown[]) {
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
      getInvocations: () => withMockController(page, "getInvocations"),
    });
  },
});

export { expect };
