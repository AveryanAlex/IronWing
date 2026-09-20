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
const calibrationMocks = vi.hoisted(() => ({
  rebootVehicle: vi.fn(async () => undefined),
}));
const notificationMocks = vi.hoisted(() => ({
  notifyUnknownError: vi.fn(),
}));

vi.mock("../../lib/analytics/client", () => ({
  trackAnalytics: analyticsMocks.trackAnalytics,
}));
vi.mock("../../calibration", () => ({
  rebootVehicle: calibrationMocks.rebootVehicle,
}));
vi.mock("../../lib/notifications", () => ({
  notifyUnknownError: notificationMocks.notifyUnknownError,
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
  const staging = { revision: 0, edits: [], apply_phase: "idle" as const, pending_reboot_ids: [] };
  return {
    subscribeAll: vi.fn(async () => () => undefined),
    fetchMetadata: vi.fn(async () => null),
    downloadAll: vi.fn(async () => undefined),
    cancelDownload: vi.fn(async () => undefined),
    stagingSnapshot: vi.fn(async () => staging),
    stage: vi.fn(async () => staging),
    discard: vi.fn(async () => staging),
    clear: vi.fn(async () => staging),
    apply: vi.fn(async () => ({ state: staging, results: [], reboot_required: false, reboot_required_ids: [] })),
    resetRebootCheckpoint: vi.fn(async () => staging),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async () => ""),
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
}

function renderSetupWorkspace(options: {
  requestedSectionId?: SetupSectionId;
  tier?: Parameters<typeof createStaticShellChromeStore>[0];
} = {}) {
  const sessionService = createSessionService();
  const sessionStore = createSessionStore(sessionService);
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
    sessionService,
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

    const osdLink = within(nav).getByTestId(`${setupWorkspaceTestIds.navPrefix}-osd`);
    expect(osdLink.getAttribute("href")).toBe("/setup/osd");
    expect(osdLink.getAttribute("data-implemented")).toBe("true");
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

  it("keeps reboot checkpoints modal until reboot or an explicitly confirmed reset", async () => {
    const { setupWorkspaceStore } = renderSetupWorkspace({ tier: "phone" });

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "reboot_required",
      reason: "Reboot this vehicle before continuing.",
    });

    expect(await screen.findByTestId(setupWorkspaceTestIds.checkpoint)).toBeTruthy();
    expect(screen.queryByText("Setup locked")).toBeNull();
    expect(get(setupWorkspaceStore).checkpoint.blocksActions).toBe(true);

    await fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId(setupWorkspaceTestIds.checkpoint)).toBeTruthy();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.checkpointReset));
    expect(screen.getByTestId(setupWorkspaceTestIds.checkpointConfirmReset)).toBeTruthy();
    expect(get(setupWorkspaceStore).checkpoint.blocksActions).toBe(true);

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.checkpointConfirmReset));
    await waitFor(() => {
      expect(get(setupWorkspaceStore).checkpoint.phase).toBe("idle");
      expect(screen.queryByTestId(setupWorkspaceTestIds.checkpoint)).toBeNull();
    });
  });

  it("disconnects after an acknowledged reboot and presents one dismiss action", async () => {
    const { sessionService, setupWorkspaceStore } = renderSetupWorkspace();

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "reboot_required",
      reason: "Reboot this vehicle before continuing.",
    });

    await fireEvent.click(await screen.findByTestId(setupWorkspaceTestIds.checkpointReboot));

    await waitFor(() => {
      expect(calibrationMocks.rebootVehicle).toHaveBeenCalledTimes(1);
      expect(sessionService.disconnectSession).toHaveBeenCalledTimes(1);
      expect(get(setupWorkspaceStore).checkpoint.phase).toBe("idle");
      expect(screen.getByTestId(setupWorkspaceTestIds.checkpointTitle).textContent).toContain("Reboot command accepted");
    });
    expect(within(screen.getByTestId(setupWorkspaceTestIds.checkpoint)).getAllByRole("button")).toEqual([
      screen.getByTestId(setupWorkspaceTestIds.checkpointAcknowledge),
    ]);

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.checkpointAcknowledge));
    await waitFor(() => {
      expect(screen.queryByTestId(setupWorkspaceTestIds.checkpoint)).toBeNull();
    });
  });

  it("keeps the reboot request single-flight until the command settles", async () => {
    let resolveReboot: (() => void) | undefined;
    calibrationMocks.rebootVehicle.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        resolveReboot = resolve;
      }),
    );
    const { setupWorkspaceStore } = renderSetupWorkspace();

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "reboot_required",
      reason: "Reboot this vehicle before continuing.",
    });

    const reboot = await screen.findByTestId(setupWorkspaceTestIds.checkpointReboot);
    await fireEvent.click(reboot);

    await waitFor(() => {
      expect((reboot as HTMLButtonElement).disabled).toBe(true);
      expect(reboot.textContent).toContain("Rebooting");
    });
    await fireEvent.click(reboot);
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(calibrationMocks.rebootVehicle).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(setupWorkspaceTestIds.checkpoint)).toBeTruthy();

    resolveReboot?.();
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.checkpointAcknowledge)).toBeTruthy();
    });
  });

  it("keeps the checkpoint dialog open when the demo vehicle rejects reboot as unsupported", async () => {
    const unsupportedError = new Error("command rejected: command=246, result=unsupported");
    calibrationMocks.rebootVehicle.mockRejectedValueOnce(unsupportedError);
    const { sessionService, setupWorkspaceStore } = renderSetupWorkspace();

    setupWorkspaceStore.setCheckpointPlaceholder({
      phase: "reboot_required",
      reason: "Reboot this vehicle before continuing.",
    });

    await fireEvent.click(await screen.findByTestId(setupWorkspaceTestIds.checkpointReboot));

    await waitFor(() => {
      expect(notificationMocks.notifyUnknownError).toHaveBeenCalledWith("Vehicle reboot failed", unsupportedError, {
        id: "setup-checkpoint-reboot-failed",
      });
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.checkpoint)).toBeTruthy();
    expect(get(setupWorkspaceStore).checkpoint.blocksActions).toBe(true);
    expect(sessionService.disconnectSession).not.toHaveBeenCalled();
  });
});
