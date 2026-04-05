// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { availableDomainValue, missingDomainValue } from "../../lib/domain-status";
import type { LiveSettingsService } from "../../lib/platform/live-settings";
import type { SessionConnectionFormState } from "../../lib/platform/session";
import { createLiveSettingsStore } from "../../lib/stores/live-settings";
import type { SessionStoreState } from "../../lib/stores/session-state";
import type { SessionEnvelope, SessionState } from "../../session";
import { writable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { toast } from "svelte-sonner";
import { withLiveSettingsContext } from "../../test/context-harnesses";
import TelemetrySettingsDialog from "./TelemetrySettingsDialog.svelte";
import { appShellTestIds } from "./chrome-state";

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

function createEnvelope(
  sessionId: string,
  overrides: Partial<SessionEnvelope> = {},
): SessionEnvelope {
  return {
    session_id: sessionId,
    source_kind: "live",
    seek_epoch: 0,
    reset_revision: 0,
    ...overrides,
  };
}

function createConnectionForm(): SessionConnectionFormState {
  return {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    serialPort: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
  };
}

function createSessionStoreState(overrides: Partial<SessionStoreState> = {}): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: null,
    activeSource: null,
    sessionDomain: missingDomainValue<SessionState>("bootstrap"),
    telemetryDomain: missingDomainValue("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: createConnectionForm(),
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    ...overrides,
  };
}

function createScopedSessionState({
  envelope = createEnvelope("session-1"),
  connectionKind = "connected",
}: {
  envelope?: SessionEnvelope;
  connectionKind?: SessionState["connection"]["kind"];
} = {}): SessionStoreState {
  return createSessionStoreState({
    activeEnvelope: envelope,
    activeSource: envelope.source_kind,
    sessionDomain: availableDomainValue(
      {
        status: "active",
        connection: connectionKind === "error"
          ? { kind: "error", error: "boom" }
          : { kind: connectionKind },
        vehicle_state: null,
        home_position: null,
      },
      envelope.source_kind === "playback" ? "playback" : "stream",
    ),
  });
}

function createMockService(overrides: Partial<LiveSettingsService> = {}) {
  return {
    loadMessageRateCatalog: vi.fn(async () => [
      { id: 33, name: "Global Position", default_rate_hz: 4 },
      { id: 30, name: "Attitude", default_rate_hz: 4 },
    ]),
    applyTelemetryRate: vi.fn(async () => undefined),
    applyMessageRate: vi.fn(async () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies LiveSettingsService;
}

async function renderDialog(options: {
  connectionKind?: SessionState["connection"]["kind"];
  envelope?: SessionEnvelope;
  service?: Partial<LiveSettingsService>;
} = {}) {
  const sessionStore = writable(
    createScopedSessionState({
      connectionKind: options.connectionKind,
      envelope: options.envelope,
    }),
  );
  const service = createMockService(options.service);
  const liveSettingsStore = createLiveSettingsStore(sessionStore, service, null);
  await liveSettingsStore.initialize();

  const rendered = render(withLiveSettingsContext(liveSettingsStore, TelemetrySettingsDialog), {
    props: {
      open: true,
    },
  });

  await waitFor(() => {
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog)).toBeTruthy();
  });

  return {
    rendered,
    sessionStore,
    service,
    liveSettingsStore,
  };
}

describe("TelemetrySettingsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps telemetry cadence editable while disconnected and disables message-rate rows", async () => {
    await renderDialog({ connectionKind: "disconnected" });

    const telemetryInput = screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryInput) as HTMLInputElement;
    const positionInput = screen.getByTestId(`${appShellTestIds.telemetrySettingsRowInputPrefix}-33`) as HTMLInputElement;

    expect(telemetryInput.disabled).toBe(false);
    expect(positionInput.disabled).toBe(true);
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).textContent).toContain(
      "active live vehicle connection",
    );
  });

  it("renders inline pending state before a successful apply settles", async () => {
    const pendingTelemetryApply = deferred<void>();
    const { service, liveSettingsStore } = await renderDialog({
      service: {
        applyTelemetryRate: vi.fn(() => pendingTelemetryApply.promise),
      },
    });

    await fireEvent.input(screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryInput), {
      target: { value: "8" },
    });
    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsApply));

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).getAttribute("data-status-kind")).toBe("pending");
    });
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).textContent).toContain(
      "Applying telemetry settings",
    );

    pendingTelemetryApply.resolve();

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).getAttribute("data-status-kind")).toBe("success");
    });

    expect(vi.mocked(service.applyTelemetryRate)).toHaveBeenCalledWith(8);
    expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).textContent).toContain("8 Hz cadence confirmed");
    expect((screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryInput) as HTMLInputElement).value).toBe("8");
    expect(liveSettingsStore).toBeTruthy();
  });

  it("retains rejected message-rate values inline and dedupes repeated error toasts", async () => {
    const { service, liveSettingsStore } = await renderDialog({
      service: {
        applyMessageRate: vi.fn(async (messageId: number) => {
          if (messageId === 33) {
            throw new Error("row rejected");
          }
        }),
      },
    });

    const positionInput = screen.getByTestId(`${appShellTestIds.telemetrySettingsRowInputPrefix}-33`) as HTMLInputElement;
    await fireEvent.input(positionInput, {
      target: { value: "6" },
    });
    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsApply));

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).getAttribute("data-status-kind")).toBe("error");
    });

    expect(screen.getByTestId(`${appShellTestIds.telemetrySettingsRowErrorPrefix}-33`).textContent).toContain(
      "row rejected",
    );
    expect(positionInput.value).toBe("6");
    expect(screen.getByTestId(appShellTestIds.telemetrySettingsStatus).textContent).toContain(
      "attempted values stay visible",
    );

    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsApply));

    await waitFor(() => {
      expect(vi.mocked(service.applyMessageRate)).toHaveBeenCalledTimes(2);
    });

    expect(vi.mocked(toast.error)).toHaveBeenCalledTimes(1);
    expect(liveSettingsStore).toBeTruthy();
  });

  it("clears invalid drafts with discard and does not resurrect them after close and reopen", async () => {
    const { rendered } = await renderDialog();

    const telemetryInput = screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryInput) as HTMLInputElement;
    const positionInput = screen.getByTestId(`${appShellTestIds.telemetrySettingsRowInputPrefix}-33`) as HTMLInputElement;

    await fireEvent.input(telemetryInput, {
      target: { value: "0" },
    });
    await fireEvent.input(positionInput, {
      target: { value: "80" },
    });
    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsApply));

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryError).textContent).toContain(
        "between 1 and 20 Hz",
      );
    });
    expect(screen.getByTestId(`${appShellTestIds.telemetrySettingsRowErrorPrefix}-33`).textContent).toContain(
      "between 0.1 and 50 Hz",
    );

    await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsDiscard));

    await waitFor(() => {
      expect(screen.queryByTestId(appShellTestIds.telemetrySettingsTelemetryError)).toBeNull();
    });

    expect(telemetryInput.value).toBe("5");
    expect(positionInput.value).toBe("");

    await rendered.rerender({ open: false });
    await waitFor(() => {
      expect(screen.queryByTestId(appShellTestIds.telemetrySettingsDialog)).toBeNull();
    });

    await rendered.rerender({ open: true });
    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog)).toBeTruthy();
    });

    expect((screen.getByTestId(appShellTestIds.telemetrySettingsTelemetryInput) as HTMLInputElement).value).toBe("5");
    expect((screen.getByTestId(`${appShellTestIds.telemetrySettingsRowInputPrefix}-33`) as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId(`${appShellTestIds.telemetrySettingsRowErrorPrefix}-33`)).toBeNull();
  });
});
