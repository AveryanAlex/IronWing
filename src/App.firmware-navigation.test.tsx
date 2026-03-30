// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  setTelemetryRate: vi.fn(async () => undefined),
  setMessageRate: vi.fn(async () => undefined),
  useSession: vi.fn(),
  useMission: vi.fn(),
  useSettings: vi.fn(),
  useParams: vi.fn(),
  useSetup: vi.fn(),
  useLogs: vi.fn(),
  useRecording: vi.fn(),
  useFirmware: vi.fn(),
  usePlayback: vi.fn(),
  useBreakpoint: vi.fn(),
  useDeviceLocation: vi.fn(),
  useGuided: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
  Toaster: () => <div data-testid="toaster" />,
}));

vi.mock("./components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("./telemetry", () => ({
  setTelemetryRate: mocks.setTelemetryRate,
  setMessageRate: mocks.setMessageRate,
}));

vi.mock("./hooks/use-session", () => ({ useSession: mocks.useSession }));
vi.mock("./hooks/use-mission", () => ({ useMission: mocks.useMission }));
vi.mock("./hooks/use-settings", () => ({ useSettings: mocks.useSettings }));
vi.mock("./hooks/use-params", () => ({ useParams: mocks.useParams }));
vi.mock("./hooks/use-setup", () => ({ useSetup: mocks.useSetup }));
vi.mock("./hooks/use-logs", () => ({ useLogs: mocks.useLogs }));
vi.mock("./hooks/use-recording", () => ({ useRecording: mocks.useRecording }));
vi.mock("./hooks/use-firmware", () => ({ useFirmware: mocks.useFirmware }));
vi.mock("./hooks/use-playback", () => ({ usePlayback: mocks.usePlayback }));
vi.mock("./hooks/use-breakpoint", () => ({ useBreakpoint: mocks.useBreakpoint }));
vi.mock("./hooks/use-device-location", () => ({ useDeviceLocation: mocks.useDeviceLocation }));
vi.mock("./hooks/use-guided", () => ({ useGuided: mocks.useGuided }));

vi.mock("./components/TopBar", () => ({
  TopBar: ({ onTabChange }: { onTabChange: (tab: string) => void }) => (
    <nav data-testid="topbar">
      <button onClick={() => onTabChange("overview")}>Overview</button>
      <button onClick={() => onTabChange("firmware")}>Firmware</button>
      <button onClick={() => onTabChange("setup")}>Setup</button>
    </nav>
  ),
}));

vi.mock("./components/BottomNav", () => ({
  BottomNav: ({ onTabChange }: { onTabChange: (tab: string) => void }) => (
    <nav data-testid="bottom-nav">
      <button onClick={() => onTabChange("overview")}>Overview</button>
      <button onClick={() => onTabChange("firmware")}>Firmware</button>
      <button onClick={() => onTabChange("setup")}>Setup</button>
    </nav>
  ),
}));

vi.mock("./components/Sidebar", () => ({ Sidebar: () => <aside data-testid="sidebar" /> }));
vi.mock("./components/OverviewPanel", () => ({ OverviewPanel: () => <div data-testid="overview-panel" /> }));
vi.mock("./components/TelemetryPanel", () => ({ TelemetryPanel: () => <div data-testid="telemetry-panel" /> }));
vi.mock("./components/hud/HudPanel", () => ({ HudPanel: () => <div data-testid="hud-panel" /> }));
vi.mock("./components/MissionPanel", () => ({ MissionPanel: () => <div data-testid="mission-panel" /> }));
vi.mock("./components/SettingsPanel", () => ({ SettingsPanel: () => <div data-testid="settings-panel" /> }));
vi.mock("./components/LogsPanel", () => ({ LogsPanel: () => <div data-testid="logs-panel" /> }));
vi.mock("./components/FirmwarePanel", () => ({
  FirmwarePanel: ({ connected }: { connected: boolean }) => (
    <div data-testid="firmware-panel">firmware:{connected ? "connected" : "disconnected"}</div>
  ),
}));
vi.mock("./components/InsetPanelFrame", () => ({ InsetPanelFrame: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("./components/setup/SetupSectionPanel", () => ({
  SetupSectionPanel: ({ setup }: { setup: { effectiveSection: string } }) => (
    <div data-testid="setup-panel">setup:{setup.effectiveSection}</div>
  ),
}));

import App from "./App";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    hydrated: true,
    connected: false,
    telemetry: { altitude_m: 0 },
    homePosition: null,
    activeEnvelope: null,
    bootstrapMissionState: null,
    bootstrapParamStore: null,
    bootstrapParamProgress: null,
    vehicleState: null,
    linkState: "disconnected",
    support: null,
    sensorHealth: { value: null },
    configurationFacts: null,
    calibration: null,
    availableModes: [],
    isConnecting: false,
    connectionError: null,
    guided: null,
    vehiclePosition: null,
    sessionDomain: null,
    telemetryDomain: null,
    statusText: null,
    ...overrides,
  };
}

function makeFirmware() {
  return {
    isActive: false,
    sessionStatus: { kind: "idle" },
    progress: null,
    activePath: null,
  };
}

describe("App firmware navigation", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    mocks.useSession.mockReturnValue(makeSession());
    mocks.useMission.mockReturnValue({});
    mocks.useSettings.mockReturnValue({
      settings: { telemetryRateHz: 4, messageRates: {}, svsEnabled: false },
      updateSettings: vi.fn(),
    });
    mocks.useParams.mockReturnValue({ saveToFile: vi.fn() });
    mocks.useSetup.mockReturnValue({ effectiveSection: "overview" });
    mocks.useLogs.mockReturnValue({});
    mocks.useRecording.mockReturnValue({ isRecording: false });
    mocks.useFirmware.mockReturnValue(makeFirmware());
    mocks.usePlayback.mockReturnValue({ activeEnvelope: null, pendingEnvelope: null });
    mocks.useBreakpoint.mockReturnValue({ sm: true, md: true, lg: true, xl: false, isMobile: false });
    mocks.useDeviceLocation.mockReturnValue(null);
    mocks.useGuided.mockReturnValue({});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps firmware reachable from the desktop app tabs even while setup is not ready", () => {
    render(<App />);

    expect(screen.getByTestId("topbar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Firmware" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Firmware" }));
    expect(screen.getByTestId("firmware-panel").textContent).toBe("firmware:disconnected");

    fireEvent.click(screen.getByRole("button", { name: "Setup" }));
    expect(screen.getByTestId("setup-panel").textContent).toBe("setup:overview");
  });

  it("keeps firmware reachable from the mobile bottom nav", () => {
    mocks.useBreakpoint.mockReturnValue({ sm: false, md: false, lg: false, xl: false, isMobile: true });

    render(<App />);

    expect(screen.getByTestId("bottom-nav")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Firmware" }));

    expect(screen.getByTestId("firmware-panel").textContent).toBe("firmware:disconnected");
    expect(screen.queryByTestId("topbar")).toBeNull();
  });
});
