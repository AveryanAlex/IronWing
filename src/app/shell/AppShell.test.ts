// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
    Toaster: () => null,
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

// maplibre-gl requires WebGL which is unavailable in jsdom. Stub the entire
// module so OverviewMap (mounted inside OperatorWorkspace) does not crash.
vi.mock("maplibre-gl", () => {
    const mockMap = {
        addControl: vi.fn(),
        addSource: vi.fn(),
        addLayer: vi.fn(),
        getSource: vi.fn(() => null),
        removeLayer: vi.fn(),
        removeSource: vi.fn(),
        setCenter: vi.fn(),
        on: vi.fn(),
        remove: vi.fn(),
    };
    const mockMarker = {
        setLngLat: vi.fn().mockReturnThis(),
        addTo: vi.fn().mockReturnThis(),
        setRotation: vi.fn().mockReturnThis(),
        remove: vi.fn(),
    };
    // Regular functions (not arrow functions) are required for `new` to work.
    function MockMap() { return mockMap; }
    function MockMarker() { return mockMarker; }
    function MockNavigationControl() { return {}; }
    return {
        default: {
            Map: MockMap,
            NavigationControl: MockNavigationControl,
            Marker: MockMarker,
        },
    };
});

import AppShellContent from "./AppShellContent.svelte";
import {
    appShellTestIds,
    createShellChromeState,
    resolveShellTier,
} from "./chrome-state";
import { parameterWorkspaceTestIds } from "../../components/params/parameter-workspace-test-ids";
import { setupWorkspaceTestIds } from "../../components/setup/setup-workspace-test-ids";
import { missionWorkspaceTestIds } from "../../components/mission/mission-workspace-test-ids";
import { firmwareWorkspaceTestIds } from "../../components/firmware/firmware-workspace-test-ids";
import { createParamsStore } from "../../lib/stores/params";
import { markRuntimeReady, resetRuntimeState } from "../../lib/stores/runtime";
import {
    createSessionStore,
    type SessionStore,
} from "../../lib/stores/session";
import { createFirmwareWorkspaceStore } from "../../lib/stores/firmware-workspace";
import { computeSerialReadinessToken, type FirmwareService } from "../../lib/platform/firmware";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type {
    SessionConnectionFormState,
    SessionService,
    SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
import type { ParamMetadataMap } from "../../param-metadata";
import {
    createHarnessFirmwareWorkspaceContext,
    withShellContexts,
} from "../../test/context-harnesses";
import type { TransportDescriptor } from "../../transport";

function createSnapshot(overrides: Partial<OpenSessionSnapshot> = {}): OpenSessionSnapshot {
    return {
        envelope: {
            session_id: "session-1",
            source_kind: "live",
            seek_epoch: 0,
            reset_revision: 0,
        },
        session: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: {
                status: "pending",
                connection: { kind: "disconnected" },
                vehicle_state: {
                    armed: false,
                    custom_mode: 0,
                    mode_name: "Stabilize",
                    system_status: "standby",
                    vehicle_type: "quadrotor",
                    autopilot: "ardu_pilot_mega",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
                home_position: null,
            },
        },
        telemetry: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        mission_state: null,
        param_store: null,
        param_progress: null,
        support: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        sensor_health: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        configuration_facts: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        calibration: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        guided: {
            available: false,
            complete: false,
            provenance: "bootstrap",
            value: null,
        },
        status_text: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: { entries: [] },
        },
        playback: { cursor_usec: null },
        ...overrides,
    };
}

function createTransportDescriptors(): TransportDescriptor[] {
    return [
        {
            kind: "udp",
            label: "UDP",
            available: true,
            validation: { bind_addr_required: true },
        },
        {
            kind: "tcp",
            label: "TCP",
            available: true,
            validation: { address_required: true },
        },
    ];
}

function createMockService(overrides: Partial<SessionService> = {}) {
    let handlers: SessionServiceEventHandlers | null = null;
    const defaultConnectionForm: SessionConnectionFormState = {
        mode: "udp",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        serialPort: "",
        baud: 57600,
        selectedBtDevice: "",
        takeoffAlt: "10",
        followVehicle: true,
    };

    const service = {
        loadConnectionForm: vi.fn(() => ({ ...defaultConnectionForm })),
        persistConnectionForm: vi.fn(),
        openSessionSnapshot: vi.fn(async () => createSnapshot()),
        ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
        subscribeAll: vi.fn(async (nextHandlers: SessionServiceEventHandlers) => {
            handlers = nextHandlers;
            return () => {
                handlers = null;
            };
        }),
        availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
        describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) =>
            descriptor.available ? `${descriptor.label} available` : `${descriptor.label} unavailable`,
        ),
        validateTransportDescriptor: vi.fn((descriptor: TransportDescriptor, value) => {
            if (descriptor.kind === "tcp" && !value.address) {
                return ["address is required"];
            }
            if (descriptor.kind === "udp" && !value.bind_addr) {
                return ["bind_addr is required"];
            }
            return [];
        }),
        buildConnectRequest: vi.fn((descriptor: TransportDescriptor, value) => ({
            transport:
                descriptor.kind === "udp"
                    ? { kind: "udp" as const, bind_addr: value.bind_addr ?? "" }
                    : { kind: "tcp" as const, address: value.address ?? "" },
        })),
        connectSession: vi.fn(async () => undefined),
        disconnectSession: vi.fn(async () => undefined),
        listSerialPorts: vi.fn(async () => []),
        btRequestPermissions: vi.fn(async () => undefined),
        btScanBle: vi.fn(async () => []),
        btGetBondedDevices: vi.fn(async () => []),
        getAvailableModes: vi.fn(async () => []),
        formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
        ...overrides,
    } satisfies SessionService;

    return {
        service,
        emit<K extends keyof SessionServiceEventHandlers>(
            event: K,
            payload: Parameters<SessionServiceEventHandlers[K]>[0],
        ) {
            if (!handlers) {
                throw new Error("session handlers are not registered");
            }

            handlers[event](payload as never);
        },
    };
}

function createMockParamsService(
    metadata: ParamMetadataMap | null = null,
    overrides: Partial<ParamsService> = {},
) {
    let handlers: ParamsServiceEventHandlers | null = null;

    const service = {
        subscribeAll: vi.fn(async (nextHandlers: ParamsServiceEventHandlers) => {
            handlers = nextHandlers;
            return () => {
                handlers = null;
            };
        }),
        fetchMetadata: vi.fn(async () => metadata),
        downloadAll: vi.fn(async () => undefined),
        writeBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
            name,
            requested_value: value,
            confirmed_value: value,
            success: true,
        }))),
        parseFile: vi.fn(async () => ({})),
        formatFile: vi.fn(async () => ""),
        formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
        ...overrides,
    } satisfies ParamsService;

    return {
        service,
        hasHandlers() {
            return handlers !== null;
        },
    };
}

function createMockFirmwareService(overrides: Partial<FirmwareService> = {}) {
    const service = {
        sessionStatus: vi.fn(async () => ({ kind: "idle" })),
        sessionCancel: vi.fn(async () => undefined),
        sessionClearCompleted: vi.fn(async () => undefined),
        serialPreflight: vi.fn(async () => ({
            vehicle_connected: false,
            param_count: 0,
            has_params_to_backup: false,
            available_ports: [
                {
                    port_name: "/dev/ttyACM0",
                    vid: null,
                    pid: null,
                    serial_number: null,
                    manufacturer: "Hex",
                    product: "CubeOrange Bootloader",
                    location: null,
                },
            ],
            detected_board_id: null,
            session_ready: true,
            session_status: { kind: "idle" },
        })),
        listPorts: vi.fn(async () => ({
            kind: "available",
            ports: [
                {
                    port_name: "/dev/ttyACM0",
                    vid: null,
                    pid: null,
                    serial_number: null,
                    manufacturer: "Hex",
                    product: "CubeOrange Bootloader",
                    location: null,
                },
            ],
        })),
        listDfuDevices: vi.fn(async () => ({
            kind: "available",
            devices: [
                {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "dfu-1",
                    serial_number: "DFU1",
                    manufacturer: "ST",
                    product: "STM32 DFU",
                },
            ],
        })),
        catalogTargets: vi.fn(async () => [
            {
                board_id: 140,
                platform: "CubeOrange",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
                vehicle_types: ["Copter", "Plane"],
                latest_version: "4.5.0",
            },
        ]),
        recoveryCatalogTargets: vi.fn(async () => [
            {
                board_id: 140,
                platform: "CubeOrange",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
                vehicle_types: ["Copter", "Plane"],
                latest_version: "4.5.0",
            },
        ]),
        catalogEntries: vi.fn(async () => [
            {
                board_id: 140,
                platform: "CubeOrange",
                vehicle_type: "Copter",
                version: "4.5.0",
                version_type: "stable",
                format: "apj",
                url: "https://example.com/cubeorange.apj",
                image_size: 123456,
                latest: true,
                git_sha: "abc123",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
            },
        ]),
        serialReadiness: vi.fn(async (request) => ({
            request_token: computeSerialReadinessToken(request),
            session_status: { kind: "idle" },
            readiness: request.source.kind === "catalog_url" && request.source.url.trim().length === 0
                ? { kind: "blocked", reason: "source_missing" }
                : request.port.trim().length === 0
                    ? { kind: "blocked", reason: "port_unselected" }
                    : { kind: "advisory" },
            target_hint: { detected_board_id: null },
            validation_pending: false,
            bootloader_transition: { kind: "manual_bootloader_entry_required" },
        })),
        flashSerial: vi.fn(async () => ({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" })),
        flashDfuRecovery: vi.fn(async () => ({ result: "verified" })),
        subscribeProgress: vi.fn(async () => () => undefined),
        formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
        ...overrides,
    } satisfies FirmwareService;

    return service;
}

function installViewportController(initialWidth: number, initialHeight = 720) {
    let width = initialWidth;
    let height = initialHeight;
    const listeners = new Map<string, Set<() => void>>();

    const readMinWidth = (query: string) => {
        const match = /min-width:\s*(\d+)px/.exec(query);
        return match ? Number.parseInt(match[1], 10) : 0;
    };

    const matches = (query: string) => width >= readMinWidth(query);

    Object.defineProperty(window, "innerWidth", {
        configurable: true,
        get: () => width,
    });
    Object.defineProperty(window, "innerHeight", {
        configurable: true,
        get: () => height,
    });
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            get matches() {
                return matches(query);
            },
            media: query,
            onchange: null,
            addListener: (listener: () => void) => {
                const bucket = listeners.get(query) ?? new Set<() => void>();
                bucket.add(listener);
                listeners.set(query, bucket);
            },
            removeListener: (listener: () => void) => {
                listeners.get(query)?.delete(listener);
            },
            addEventListener: (_type: string, listener: () => void) => {
                const bucket = listeners.get(query) ?? new Set<() => void>();
                bucket.add(listener);
                listeners.set(query, bucket);
            },
            removeEventListener: (_type: string, listener: () => void) => {
                listeners.get(query)?.delete(listener);
            },
            dispatchEvent: vi.fn(),
        })),
    });

    return {
        setSize(nextWidth: number, nextHeight = height) {
            const prior = new Map<string, boolean>();
            for (const query of listeners.keys()) {
                prior.set(query, matches(query));
            }

            width = nextWidth;
            height = nextHeight;
            window.dispatchEvent(new Event("resize"));

            for (const [query, bucket] of listeners.entries()) {
                if (prior.get(query) === matches(query)) {
                    continue;
                }

                for (const listener of bucket) {
                    listener();
                }
            }
        },
    };
}

async function renderShellAt(
    width: number,
    options: {
        snapshot?: OpenSessionSnapshot;
        metadata?: ParamMetadataMap | null;
        firmwareWorkspaceContext?: ReturnType<typeof createHarnessFirmwareWorkspaceContext>;
    } = {},
) {
    const viewport = installViewportController(width);
    const { service } = createMockService({
        openSessionSnapshot: vi.fn(async () => options.snapshot ?? createSnapshot()),
    });
    const paramsHarness = createMockParamsService(options.metadata ?? null);
    const store = createSessionStore(service);
    const parameterStore = createParamsStore(store, paramsHarness.service);
    await store.initialize();
    await parameterStore.initialize();
    markRuntimeReady("2026-04-03T12:34:56.000Z");

    render(withShellContexts(store, parameterStore, AppShellContent, {
        firmwareWorkspaceContext: options.firmwareWorkspaceContext,
    }));

    await waitFor(() => {
        expect(screen.getByTestId(appShellTestIds.tier)).toBeTruthy();
    });

    return {
        viewport,
        store,
        parameterStore,
    } satisfies {
        viewport: ReturnType<typeof installViewportController>;
        store: SessionStore;
        parameterStore: ReturnType<typeof createParamsStore>;
    };
}

async function openSetupWorkspace() {
    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterWorkspaceButton));

    await waitFor(() => {
        expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("setup");
        expect(screen.getByTestId(setupWorkspaceTestIds.root)).toBeTruthy();
    });
}

async function openSetupFullParameters() {
    await openSetupWorkspace();
    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`));

    await waitFor(() => {
        expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
        expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    });
}

describe("AppShell", () => {
    beforeEach(() => {
        resetRuntimeState();
        if (typeof localStorage.clear === "function") {
            localStorage.clear();
        }
    });

    afterEach(() => {
        cleanup();
        resetRuntimeState();
    });

    it("keeps runtime markers and the live vehicle panel docked on wide layouts", async () => {
        await renderShellAt(1440);

        expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("wide");
        expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
        expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
        expect(screen.getByTestId(appShellTestIds.operatorWorkspace)).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.mainViewport)).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.vehiclePanelRail).getAttribute("data-panel-state")).toBe("docked");
        expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
        expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
        expect(screen.getByTestId("sidebar-telemetry-panel")).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.connectionIndicator)).toBeTruthy();
        expect(screen.getByTestId("telemetry-state-value")).toBeTruthy();
        expect(screen.getByTestId("telemetry-alt-value")).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.sessionEnvelope).textContent).toContain("session-1");
    });

    it("shows a global replay read-only banner when playback is active", async () => {
        await renderShellAt(1440, {
            snapshot: createSnapshot({
                envelope: {
                    session_id: "playback-1",
                    source_kind: "playback",
                    seek_epoch: 1,
                    reset_revision: 1,
                },
            }),
        });

        expect(screen.getByTestId(appShellTestIds.replayReadonlyBanner).textContent).toContain("Replay is read-only");
    });

    it("renders the archived tab shape, keeps placeholder tabs where expected, and mounts the real mission workspace", async () => {
        await renderShellAt(1440);

        expect(screen.getByRole("button", { name: "Overview" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Telemetry" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "HUD" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Mission" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Logs" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Firmware" })).toBeTruthy();
        const setupTab = screen.getByRole("button", { name: "Setup" });
        const appSettingsTab = screen.getByRole("button", { name: "App settings" });
        expect(setupTab).toBeTruthy();
        expect(appSettingsTab).toBeTruthy();
        expect(Boolean(setupTab.compareDocumentPosition(appSettingsTab) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

        await fireEvent.click(screen.getByRole("button", { name: "Telemetry" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("telemetry");
        });

        // Telemetry now has a real workspace (TelemetryWorkspace) rather than a placeholder.
        expect(screen.queryByTestId("app-shell-placeholder-telemetry")).toBeNull();
        // The sidebar telemetry panel is not visible in the main workspace area.
        expect(screen.queryByTestId("telemetry-state-value")).toBeNull();

        await fireEvent.click(screen.getByRole("button", { name: "Mission" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("mission");
        });

        expect(screen.getByTestId(missionWorkspaceTestIds.root)).toBeTruthy();
        expect(screen.queryByTestId("app-shell-placeholder-mission")).toBeNull();
        expect(screen.getByTestId(missionWorkspaceTestIds.empty)).toBeTruthy();
        expect(screen.getByTestId(missionWorkspaceTestIds.entryRead)).toBeTruthy();
        expect(screen.getByTestId(missionWorkspaceTestIds.entryImport)).toBeTruthy();
        expect(screen.getByTestId(missionWorkspaceTestIds.entryNew)).toBeTruthy();
    });

    it("mounts the real firmware workspace and preserves shell-scoped firmware state across tab switches", async () => {
        const firmwareService = createMockFirmwareService();
        const firmwareWorkspaceContext = createHarnessFirmwareWorkspaceContext({
            service: firmwareService,
            store: createFirmwareWorkspaceStore(firmwareService, { sessionPollMs: 0 }),
        });

        await renderShellAt(1440, { firmwareWorkspaceContext });

        await fireEvent.click(screen.getByRole("button", { name: "Firmware" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("firmware");
            expect(screen.getByTestId(firmwareWorkspaceTestIds.root)).toBeTruthy();
        });

        expect(screen.queryByTestId("app-shell-placeholder-firmware")).toBeNull();

        await fireEvent.input(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch), {
            target: { value: "cube" },
        });
        await waitFor(() => {
            expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetResults)).toBeTruthy();
        });
        await fireEvent.click(screen.getByRole("button", { name: /Cube Orange/i }));

        await waitFor(() => {
            expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSelected).textContent).toContain("Cube Orange");
            expect(screen.getByTestId(firmwareWorkspaceTestIds.catalogEntrySelect)).toBeTruthy();
        });

        await fireEvent.click(screen.getByRole("button", { name: "Overview" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
            expect(screen.getByTestId(appShellTestIds.operatorWorkspace)).toBeTruthy();
        });

        await fireEvent.click(screen.getByRole("button", { name: "Firmware" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("firmware");
            expect(screen.getByTestId(firmwareWorkspaceTestIds.root)).toBeTruthy();
            expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSelected).textContent).toContain("Cube Orange");
            expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
        });
    });

    it("mounts the dedicated setup workspace root and keeps partial facts explicit", async () => {
        await renderShellAt(1440, {
            snapshot: createSnapshot({
                configuration_facts: {
                    available: true,
                    complete: false,
                    provenance: "bootstrap",
                    value: {
                        frame: null,
                        gps: { configured: true },
                        battery_monitor: null,
                        motors_esc: null,
                    },
                },
                calibration: {
                    available: true,
                    complete: false,
                    provenance: "bootstrap",
                    value: {
                        accel: { lifecycle: "not_started", progress: null, report: null },
                        compass: null,
                        radio: null,
                    },
                },
                param_store: {
                    expected_count: 2,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
                    },
                },
                param_progress: "completed",
            }),
            metadata: new Map([
                [
                    "ARMING_CHECK",
                    {
                        humanName: "Arming checks",
                        description: "Controls pre-arm validation.",
                    },
                ],
            ]),
        });

        await openSetupWorkspace();

        expect(screen.queryByTestId("telemetry-state-value")).toBeNull();
        expect(screen.queryByTestId(parameterWorkspaceTestIds.root)).toBeNull();
        expect(screen.getByTestId(setupWorkspaceTestIds.state).textContent).toContain("Setup ready");
        // The compact nav only renders a status badge for complete / in_progress / failed — not for "unknown".
        expect(screen.queryByTestId(`${setupWorkspaceTestIds.sectionStatusPrefix}-frame_orientation`)).toBeNull();
        expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionConfidencePrefix}-frame_orientation`).textContent?.trim()).toBe("Unconfirmed");
        expect(screen.getByTestId(setupWorkspaceTestIds.detailRecovery).textContent).toContain("Full Parameters stays separate");
    });

    it("opens the expert browser from a workflow handoff inside the shell and stages raw edits into the shared tray", async () => {
        await renderShellAt(1440, {
            snapshot: createSnapshot({
                param_store: {
                    expected_count: 5,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
                        BATT_FS_LOW_ACT: { name: "BATT_FS_LOW_ACT", value: 0, param_type: "uint8", index: 2 },
                        BATT_FS_CRT_ACT: { name: "BATT_FS_CRT_ACT", value: 0, param_type: "uint8", index: 3 },
                        LOG_BITMASK: { name: "LOG_BITMASK", value: 5, param_type: "uint32", index: 4 },
                    },
                },
                param_progress: "completed",
            }),
            metadata: new Map([
                [
                    "ARMING_CHECK",
                    {
                        humanName: "Arming checks",
                        description: "Controls pre-arm validation.",
                        rebootRequired: true,
                        values: [
                            { code: 0, label: "Disabled" },
                            { code: 1, label: "All checks" },
                        ],
                        userLevel: "Standard",
                    },
                ],
                [
                    "FS_THR_ENABLE",
                    {
                        humanName: "Throttle failsafe",
                        description: "Select the throttle failsafe behavior.",
                        values: [
                            { code: 0, label: "Disabled" },
                            { code: 1, label: "Enabled always" },
                        ],
                        userLevel: "Standard",
                    },
                ],
                [
                    "BATT_FS_LOW_ACT",
                    {
                        humanName: "Low battery action",
                        description: "Action taken on low battery.",
                        values: [
                            { code: 0, label: "None" },
                            { code: 2, label: "RTL" },
                        ],
                    },
                ],
                [
                    "BATT_FS_CRT_ACT",
                    {
                        humanName: "Critical battery action",
                        description: "Action taken on critical battery.",
                        values: [
                            { code: 0, label: "None" },
                            { code: 1, label: "Land" },
                        ],
                    },
                ],
                [
                    "LOG_BITMASK",
                    {
                        humanName: "Log bitmask",
                        description: "Enabled log streams.",
                        bitmask: [
                            { bit: 0, label: "Fast attitude" },
                            { bit: 2, label: "PID" },
                        ],
                        userLevel: "Advanced",
                    },
                ],
            ]),
        });

        await openSetupFullParameters();

        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.workflowOpenAdvancedPrefix}-safety`));

        expect(screen.getByTestId(parameterWorkspaceTestIds.advancedPanel)).toBeTruthy();
        expect(screen.getByTestId(parameterWorkspaceTestIds.expertHighlightSummary).textContent).toContain(
            "highlighting 4 parameters",
        );
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.highlightPrefix}-ARMING_CHECK`)).toBeTruthy();

        await fireEvent.change(screen.getByTestId(`${parameterWorkspaceTestIds.inputPrefix}-ARMING_CHECK`), {
            target: { value: "1" },
        });
        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.stageButtonPrefix}-ARMING_CHECK`));

        expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("1 queued");
        expect(screen.getByTestId(appShellTestIds.parameterWorkspacePendingCount).textContent?.trim()).toBe("1");
    });

    it("keeps overview mounted and gates guided setup sections when metadata is unavailable", async () => {
        await renderShellAt(1440, {
            snapshot: createSnapshot({
                param_store: {
                    expected_count: 2,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
                    },
                },
                param_progress: "completed",
            }),
        });

        await openSetupWorkspace();

        expect(screen.getByTestId(setupWorkspaceTestIds.metadata).textContent).toContain("Parameter metadata is unavailable");
        expect(screen.getByTestId(setupWorkspaceTestIds.notice).textContent).toContain("Parameter metadata is unavailable");
        expect(screen.getByTestId(setupWorkspaceTestIds.overviewBanner).textContent).toContain(
            "Metadata missing — recovery mode is active",
        );
        expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-overview`)).toBeTruthy();
        expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`)).toBeTruthy();
        expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`).getAttribute("data-availability")).toBe("blocked");
        expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-rc_receiver`).getAttribute("data-availability")).toBe("blocked");
        expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-calibration`).getAttribute("data-availability")).toBe("blocked");

        await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`));
        await waitFor(() => {
            expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
        });
    });

    it("mounts one shared review tray, keeps staged edits across workspace toggles, and preserves the queue across shell tiers", async () => {
        const { viewport } = await renderShellAt(1440, {
            snapshot: createSnapshot({
                param_store: {
                    expected_count: 2,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
                    },
                },
                param_progress: "completed",
            }),
            metadata: new Map([
                [
                    "ARMING_CHECK",
                    {
                        humanName: "Arming checks",
                        description: "Controls pre-arm validation.",
                        rebootRequired: true,
                    },
                ],
                [
                    "FS_THR_ENABLE",
                    {
                        humanName: "Throttle failsafe",
                        description: "Select the throttle failsafe behavior.",
                    },
                ],
            ]),
        });

        expect(screen.queryByTestId(appShellTestIds.parameterReviewTray)).toBeNull();

        await openSetupFullParameters();

        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`));

        expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("closed");
        expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 queued");
        expect(screen.getByTestId(appShellTestIds.parameterWorkspacePendingCount).textContent?.trim()).toBe("2");

        await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("open");
        });

        expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-ARMING_CHECK`).textContent).toContain("reboot required");
        expect(screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FS_THR_ENABLE`).textContent).toContain("1");

        await fireEvent.click(screen.getByTestId(appShellTestIds.overviewWorkspaceButton));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("overview");
        });

        expect(screen.getByTestId(appShellTestIds.operatorWorkspace)).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 queued");
        expect(screen.queryByTestId(parameterWorkspaceTestIds.root)).toBeNull();
        expect(
            screen
                .getByTestId(appShellTestIds.mainViewport)
                .closest("[data-has-staged-edits]")
                ?.getAttribute("data-has-staged-edits"),
        ).toBe("true");

        await openSetupFullParameters();

        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowRowStatePrefix}-safety-ARMING_CHECK`).textContent).toContain(
            "Queued",
        );
        expect(screen.getByTestId(`${parameterWorkspaceTestIds.workflowRowStatePrefix}-safety-FS_THR_ENABLE`).textContent).toContain(
            "Queued",
        );

        viewport.setSize(390, 720);

        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
        });

        expect(screen.getAllByTestId(appShellTestIds.parameterReviewTray)).toHaveLength(1);
        expect(screen.getByTestId(appShellTestIds.parameterReviewTray).getAttribute("data-surface-kind")).toBe("sheet");
        expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("open");
        expect(screen.getByTestId(appShellTestIds.parameterReviewCount).textContent).toContain("2 queued");
    });

    it("closes the review tray when staged edits drop to zero", async () => {
        await renderShellAt(1440, {
            snapshot: createSnapshot({
                param_store: {
                    expected_count: 1,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 0, param_type: "uint8", index: 0 },
                    },
                },
                param_progress: "completed",
            }),
            metadata: new Map([
                [
                    "ARMING_CHECK",
                    {
                        humanName: "Arming checks",
                        description: "Controls pre-arm validation.",
                    },
                ],
            ]),
        });

        await openSetupFullParameters();

        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`));
        await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("open");
        });

        await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewClear));
        await waitFor(() => {
            expect(screen.queryByTestId(appShellTestIds.parameterReviewTray)).toBeNull();
        });

        await fireEvent.click(screen.getByTestId(`${parameterWorkspaceTestIds.workflowStageButtonPrefix}-safety`));

        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.parameterReviewTray)).toBeTruthy();
        });
        expect(screen.getByTestId(appShellTestIds.parameterReviewState).textContent?.trim()).toBe("closed");
    });

    it("exposes a phone-only Vehicle panel drawer while keeping the live status cards visible", async () => {
        await renderShellAt(390);

        const toggle = screen.getByRole("button", { name: "Vehicle panel" });
        expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
        expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
        expect(screen.queryByTestId(appShellTestIds.vehiclePanelRail)).toBeNull();
        expect(screen.queryByTestId("connection-connect-btn")).toBeNull();
        expect(screen.getByTestId(appShellTestIds.operatorWorkspace)).toBeTruthy();
        expect(screen.getByTestId("telemetry-state-value")).toBeTruthy();
        expect(screen.getByTestId("telemetry-alt-value")).toBeTruthy();

        await fireEvent.click(toggle);
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("open");
        });

        expect(screen.getByTestId(appShellTestIds.vehiclePanelDrawer).getAttribute("data-state")).toBe("open");
        expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
        expect(screen.getByTestId("sidebar-telemetry-panel")).toBeTruthy();

        await fireEvent.click(screen.getByTestId(appShellTestIds.vehiclePanelClose));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("closed");
        });
    });

    it("opens one shell-scoped telemetry controls dialog from the rail and reuses it from the phone drawer", async () => {
        const { viewport } = await renderShellAt(1440);

        await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsLauncher));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog)).toBeTruthy();
        });

        expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog).getAttribute("data-surface-kind")).toBe("dialog");

        viewport.setSize(390, 720);

        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("phone");
        });

        expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog).getAttribute("data-surface-kind")).toBe("sheet");

        await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsClose));
        await waitFor(() => {
            expect(screen.queryByTestId(appShellTestIds.telemetrySettingsDialog)).toBeNull();
        });

        await fireEvent.click(screen.getByRole("button", { name: "Vehicle panel" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("open");
        });

        expect(screen.getByTestId(appShellTestIds.telemetrySettingsLauncher)).toBeTruthy();

        await fireEvent.click(screen.getByTestId(appShellTestIds.telemetrySettingsLauncher));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog)).toBeTruthy();
        });

        expect(screen.getByTestId(appShellTestIds.telemetrySettingsDialog).getAttribute("data-surface-kind")).toBe("sheet");
    });

    it("promotes the vehicle panel back to a docked layout at Radiomaster width and closes the phone drawer", async () => {
        const { viewport } = await renderShellAt(390);

        await fireEvent.click(screen.getByRole("button", { name: "Vehicle panel" }));
        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("open");
        });

        viewport.setSize(1280, 720);

        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("wide");
        });

        expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
        expect(screen.getByTestId(appShellTestIds.vehiclePanelRail)).toBeTruthy();
        expect(screen.queryByTestId(appShellTestIds.vehiclePanelButton)).toBeNull();
        expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
        expect(screen.getByTestId(appShellTestIds.vehiclePanelDrawer).getAttribute("data-state")).toBe("closed");
    });

    it("falls back to a desktop-safe docked layout when matchMedia is unavailable", async () => {
        const { service } = createMockService();
        const paramsHarness = createMockParamsService();
        const store = createSessionStore(service);
        const parameterStore = createParamsStore(store, paramsHarness.service);
        await store.initialize();
        await parameterStore.initialize();
        markRuntimeReady("2026-04-03T12:34:56.000Z");

        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            value: 1024,
        });
        Object.defineProperty(window, "innerHeight", {
            configurable: true,
            value: 720,
        });
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: undefined,
        });

        render(withShellContexts(store, parameterStore, AppShellContent));

        await waitFor(() => {
            expect(screen.getByTestId(appShellTestIds.tier).textContent?.trim()).toBe("desktop");
        });

        expect(screen.getByTestId(appShellTestIds.drawerState).textContent?.trim()).toBe("docked");
        expect(screen.getByTestId(appShellTestIds.vehiclePanelRail)).toBeTruthy();
        expect(screen.getByTestId("connection-connect-btn")).toBeTruthy();
    });

    it("falls back to canonical tiers when an unsupported tier override is provided", () => {
        expect(resolveShellTier("unsupported", "desktop")).toBe("desktop");
        expect(
            createShellChromeState({ sm: true, md: true, lg: true, xl: false }, { width: 1180, height: 720 }, "bogus").tier,
        ).toBe("desktop");
    });
});
