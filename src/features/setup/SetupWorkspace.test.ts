// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionService } from "../../lib/platform/session";
import { sessionConnectionDefaults } from "../../lib/platform/session";
import type { ParamsService } from "../../lib/platform/params";
import { createParamsStore } from "../../lib/stores/params";
import { createSessionStore } from "../../lib/stores/session";
import { createSetupWorkspaceStore } from "../../lib/stores/setup-workspace";
import type { SetupSectionId } from "../../lib/setup-sections";
import { createStaticShellChromeStore, withShellContexts } from "../../test/context-harnesses";
import SetupWorkspace from "./components/SetupWorkspaceShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const analyticsMocks = vi.hoisted(() => ({
  trackAnalytics: vi.fn(),
}));

vi.mock("../../lib/analytics/client", () => ({
  trackAnalytics: analyticsMocks.trackAnalytics,
}));

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
  requestedSectionId?: SetupSectionId;
  tier?: Parameters<typeof createStaticShellChromeStore>[0];
} = {}) {
  const sessionStore = createSessionStore(createSessionService());
  const parameterStore = createParamsStore(sessionStore, createParamsService());
  const setupWorkspaceStore = createSetupWorkspaceStore(sessionStore, parameterStore, { uiState: null });
  const navigateToSetupSection = vi.fn(async () => undefined);

  render(
    withShellContexts(sessionStore, parameterStore, SetupWorkspace, {
      setupWorkspaceStore,
      chromeStore: createStaticShellChromeStore(options.tier ?? "wide"),
    }),
    {
      props: {
        navigateToSetupSection,
        requestedSectionId: options.requestedSectionId,
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
    const navigationLink = within(nav).getByTestId(`${setupWorkspaceTestIds.navPrefix}-navigation`);
    expect(navigationLink.getAttribute("href")).toBe("/setup/navigation");
    expect(navigationLink.getAttribute("data-sveltekit-preload-code")).toBe("hover");
    expect(navigationLink.getAttribute("data-sveltekit-preload-data")).toBe("hover");
  });

  it("selects a representative setup section from the shell navigation", async () => {
    const { setupWorkspaceStore } = renderSetupWorkspace();
    const navigationLink = screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-navigation`);
    navigationLink.addEventListener("click", (event) => event.preventDefault());

    await fireEvent.click(navigationLink);

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.root).querySelector("[data-selected-section]")?.getAttribute("data-selected-section")).toBe("navigation");
    });
    expect(get(setupWorkspaceStore).selectedSectionId).toBe("navigation");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-navigation`).getAttribute("aria-current")).toBe("page");
  });

  it("tracks a route-selected setup section without an intermediate overview view", async () => {
    const { setupWorkspaceStore } = renderSetupWorkspace({ requestedSectionId: "navigation" });

    await waitFor(() => {
      expect(get(setupWorkspaceStore).selectedSectionId).toBe("navigation");
    });
    await waitFor(() => {
      expect(analyticsMocks.trackAnalytics).toHaveBeenCalledWith("setup_section_viewed", {
        connected: 0,
        section: "navigation",
      });
    });
    expect(analyticsMocks.trackAnalytics).not.toHaveBeenCalledWith(
      "setup_section_viewed",
      expect.objectContaining({ section: "overview" }),
    );
  });
});
