// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionService } from "../../lib/platform/session";
import { sessionConnectionDefaults } from "../../lib/platform/session";
import type { ParamsService } from "../../lib/platform/params";
import { createParamsStore } from "../../lib/stores/params";
import { createSessionStore } from "../../lib/stores/session";
import {
  createSetupWorkspaceStore,
  createSetupWorkspaceViewStore,
} from "../../lib/stores/setup-workspace";
import { createStaticShellChromeStore, withShellContexts } from "../../test/context-harnesses";
import SetupWorkspace from "./components/SetupWorkspaceShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

function createSessionService(): SessionService {
  return {
    loadConnectionForm: () => ({ ...sessionConnectionDefaults }),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => {
      throw new Error("unused in setup shell smoke tests");
    }),
    ackSessionSnapshot: vi.fn(async () => {
      throw new Error("unused in setup shell smoke tests");
    }),
    subscribeAll: vi.fn(async () => () => undefined),
    availableTransportDescriptors: vi.fn(async () => []),
    describeTransportAvailability: () => "Available",
    validateTransportDescriptor: () => [],
    buildConnectRequest: () => {
      throw new Error("unused in setup shell smoke tests");
    },
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
    listSerialPorts: vi.fn(async () => []),
    btRequestPermissions: vi.fn(async () => undefined),
    btScanBle: vi.fn(async () => []),
    btGetBondedDevices: vi.fn(async () => []),
    getAvailableModes: vi.fn(async () => []),
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
}

function createParamsService(): ParamsService {
  return {
    subscribeAll: vi.fn(async () => () => undefined),
    fetchMetadata: vi.fn(async () => null),
    downloadAll: vi.fn(async () => undefined),
    cancelDownload: vi.fn(async () => undefined),
    writeBatch: vi.fn(async () => []),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async () => ""),
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
}

function renderSetupWorkspace(options: {
  tier?: Parameters<typeof createStaticShellChromeStore>[0];
} = {}) {
  const sessionStore = createSessionStore(createSessionService());
  const parameterStore = createParamsStore(sessionStore, createParamsService());
  const setupWorkspaceStore = createSetupWorkspaceStore(sessionStore, parameterStore, { uiState: null });
  const setupWorkspaceViewStore = createSetupWorkspaceViewStore(setupWorkspaceStore);
  const navigateToSetupSection = vi.fn(async () => undefined);

  render(
    withShellContexts(sessionStore, parameterStore, SetupWorkspace, {
      setupWorkspaceStore,
      setupWorkspaceViewStore,
      chromeStore: createStaticShellChromeStore(options.tier ?? "wide"),
    }),
    {
      props: {
        navigateToSetupSection,
      },
    },
  );

  return {
    navigateToSetupSection,
    setupWorkspaceStore,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SetupWorkspace", () => {
  it("mounts the setup shell with the section rail and overview selected", () => {
    renderSetupWorkspace();

    const root = screen.getByTestId(setupWorkspaceTestIds.root);
    expect(root.getAttribute("data-mode")).toBe("split");
    expect(root.querySelector("[data-selected-section]")?.getAttribute("data-selected-section")).toBe("overview");

    const nav = screen.getByTestId(setupWorkspaceTestIds.nav);
    expect(within(nav).getByText("Essential Setup")).toBeTruthy();
    expect(within(nav).getByTestId(`${setupWorkspaceTestIds.navPrefix}-overview`).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(nav).getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`).getAttribute("href")).toBe("/setup/gps");
  });

  it("selects a representative setup section from the shell navigation", async () => {
    const { setupWorkspaceStore } = renderSetupWorkspace();
    const gpsLink = screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`);
    gpsLink.addEventListener("click", (event) => event.preventDefault());

    await fireEvent.click(gpsLink);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.root).querySelector("[data-selected-section]")?.getAttribute("data-selected-section")).toBe("gps");
    });
    expect(get(setupWorkspaceStore).selectedSectionId).toBe("gps");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-gps`).getAttribute("aria-current")).toBe("page");
  });
});
