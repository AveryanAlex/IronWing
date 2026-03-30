// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { missingDomainValue } from "../lib/domain-status";
import type { CalibrationState } from "../calibration";
import type { ConfigurationFactsState } from "../configuration-facts";
import type { SensorHealthState } from "../sensor-health";
import type { SupportState } from "../support";
import type { ParamsState } from "./use-params";
import type { VehicleState } from "../telemetry";
import type { UseSetupFacts } from "./use-setup";
import type { SectionStatus, SetupSectionsReturn } from "./use-setup-sections";

const useSetupSections = vi.fn<(
  vehicleState: VehicleState | null,
  facts: UseSetupFacts,
) => SetupSectionsReturn>();

vi.mock("./use-setup-sections", () => ({
  useSetupSections,
}));

function makeParams(overrides: Partial<ParamsState> = {}): ParamsState {
  return {
    store: { params: {}, expected_count: 0 },
    progress: null,
    search: "",
    setSearch: vi.fn(),
    editingParam: null,
    setEditingParam: vi.fn(),
    editValue: "",
    setEditValue: vi.fn(),
    paramList: [],
    filteredParams: [],
    groupedParams: {},
    download: vi.fn(),
    cancel: vi.fn(),
    write: vi.fn(),
    saveToFile: vi.fn(),
    loadFromFile: vi.fn(),
    metadata: new Map(),
    metadataLoading: false,
    staged: new Map(),
    stage: vi.fn(),
    unstage: vi.fn(),
    unstageAll: vi.fn(),
    applyStaged: vi.fn(),
    filterMode: "standard",
    setFilterMode: vi.fn(),
    ...overrides,
  };
}

function makeSections(overrides: Partial<SetupSectionsReturn> = {}): SetupSectionsReturn {
  return {
    activeSection: "overview",
    setActiveSection: vi.fn(),
    sectionStatuses: new Map([["overview", "not_started" satisfies SectionStatus]]),
    overallProgress: { completed: 0, total: 9, percentage: 0 },
    confirmSection: vi.fn(),
    resetSections: vi.fn(),
    ...overrides,
  };
}

function makeUnavailableFacts(): UseSetupFacts {
  return {
    support: null,
    sensorHealth: null,
    configurationFacts: null,
    calibration: null,
  };
}

async function renderUseSetup(
  params: ParamsState,
  vehicleState: VehicleState | null,
  facts: UseSetupFacts,
  connected: boolean,
) {
  const { useSetup } = await import("./use-setup");
  return renderHook(() => useSetup(params, vehicleState, facts, connected));
}

describe("useSetup", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useSetupSections.mockReset();
    document.body.innerHTML = "";
  });

  it("exposes a panel-consumable contract while preserving params identity", async () => {
    const params = makeParams();
    const vehicleState = {
      armed: false,
      custom_mode: 0,
      mode_name: "Stabilize",
      system_status: "standby",
      vehicle_type: "quadrotor",
      autopilot: "ardu_pilot_mega",
      system_id: 42,
      component_id: 1,
      heartbeat_received: true,
    } satisfies VehicleState;
    const facts: UseSetupFacts = {
      support: missingDomainValue<SupportState>("stream"),
      sensorHealth: missingDomainValue<SensorHealthState>("stream"),
      configurationFacts: missingDomainValue<ConfigurationFactsState>("stream"),
      calibration: missingDomainValue<CalibrationState>("stream"),
    };
    const sections = makeSections({
      activeSection: "frame_orientation",
      overallProgress: { completed: 1, total: 9, percentage: 11 },
    });

    useSetupSections.mockReturnValue(sections);

    const { result } = await renderUseSetup(params, vehicleState, facts, true);

    expect(useSetupSections).toHaveBeenCalledWith(vehicleState, facts);
    expect(result.current.params).toBe(params);
    expect(result.current.sectionStatuses).toBe(sections.sectionStatuses);
    expect(result.current.overallProgress).toBe(sections.overallProgress);
    expect(result.current.paramsLoaded).toBe(true);
    expect(result.current.setupReady).toBe(true);
    expect(result.current.effectiveSection).toBe("frame_orientation");
  });

  it("keeps setup frontend-derived by gating unavailable setup state to overview", async () => {
    const params = makeParams({ metadata: null });
    const setActiveSection = vi.fn();

    useSetupSections.mockReturnValue(
      makeSections({ activeSection: "gps", setActiveSection }),
    );

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), true);

    expect(result.current.setupReady).toBe(false);
    expect(result.current.effectiveSection).toBe("overview");
    expect(setActiveSection).toHaveBeenCalledWith("overview");
  });

  it("shows setup overview while disconnected without rewriting persisted section state", async () => {
    const params = makeParams({ metadata: null });
    const setActiveSection = vi.fn();

    useSetupSections.mockReturnValue(
      makeSections({ activeSection: "gps", setActiveSection }),
    );

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), false);

    expect(result.current.effectiveSection).toBe("overview");
    expect(setActiveSection).not.toHaveBeenCalled();
  });

  it("navigates missing params through setup-owned full-parameters orchestration", async () => {
    const params = makeParams({ metadata: null });
    const setActiveSection = vi.fn();

    useSetupSections.mockReturnValue(
      makeSections({ activeSection: "flight_modes", setActiveSection }),
    );

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), true);

    act(() => {
      result.current.navigateToParam("BATT_MONITOR");
    });

    expect(params.setFilterMode).toHaveBeenCalledWith("all");
    expect(params.setSearch).toHaveBeenCalledWith("BATT_MONITOR");
    expect(setActiveSection).toHaveBeenCalledWith("full_parameters");
    expect(result.current.pendingHighlightParam).toBe("BATT_MONITOR");

    act(() => {
      result.current.handleHighlightHandled();
    });

    expect(result.current.pendingHighlightParam).toBeNull();
  });

  it("highlights an already-rendered param without rerouting setup state", async () => {
    vi.useFakeTimers();

    const params = makeParams();
    const setActiveSection = vi.fn();
    const el = document.createElement("div");
    el.dataset.setupParam = "FRAME_CLASS";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    useSetupSections.mockReturnValue(
      makeSections({ activeSection: "full_parameters", setActiveSection }),
    );

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), true);

    act(() => {
      result.current.navigateToParam("FRAME_CLASS");
    });

    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(el.classList.contains("setup-param-highlight")).toBe(true);
    expect(params.setFilterMode).not.toHaveBeenCalled();
    expect(params.setSearch).not.toHaveBeenCalled();
    expect(setActiveSection).not.toHaveBeenCalledWith("full_parameters");
    expect(result.current.pendingHighlightParam).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(el.classList.contains("setup-param-highlight")).toBe(false);
  });

  it("clears the previous highlighted param before highlighting a new one", async () => {
    vi.useFakeTimers();

    const params = makeParams();
    const first = document.createElement("div");
    first.dataset.setupParam = "FRAME_CLASS";
    first.scrollIntoView = vi.fn();
    document.body.appendChild(first);

    const second = document.createElement("div");
    second.dataset.setupParam = "BATT_MONITOR";
    second.scrollIntoView = vi.fn();
    document.body.appendChild(second);

    useSetupSections.mockReturnValue(makeSections({ activeSection: "full_parameters" }));

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), true);

    act(() => {
      result.current.navigateToParam("FRAME_CLASS");
    });
    expect(first.classList.contains("setup-param-highlight")).toBe(true);

    act(() => {
      result.current.navigateToParam("BATT_MONITOR");
    });

    expect(first.classList.contains("setup-param-highlight")).toBe(false);
    expect(second.classList.contains("setup-param-highlight")).toBe(true);
  });

  it("clears stale pending highlight when a direct DOM hit succeeds", async () => {
    const params = makeParams();
    const el = document.createElement("div");
    el.dataset.setupParam = "FRAME_CLASS";
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    useSetupSections.mockReturnValue(makeSections({ activeSection: "full_parameters" }));

    const { result } = await renderUseSetup(params, null, makeUnavailableFacts(), true);

    act(() => {
      result.current.navigateToParam("BATT_MONITOR");
    });
    expect(result.current.pendingHighlightParam).toBe("BATT_MONITOR");

    act(() => {
      result.current.navigateToParam("FRAME_CLASS");
    });

    expect(result.current.pendingHighlightParam).toBeNull();
  });
});
