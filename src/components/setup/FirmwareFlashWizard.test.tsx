// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerialFlashOutcome, SerialReadinessRequest, SerialReadinessResponse } from "../../firmware";
import { FirmwareFlashWizard, type FirmwareFlashWizardProps } from "./FirmwareFlashWizard";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fnv1a64(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function serialReadinessToken(request: SerialReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64(request.source.data)}`;
  return `serial-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

const DEFAULT_READINESS_REQUEST: SerialReadinessRequest = {
  port: "/dev/ttyACM0",
  source: { kind: "catalog_url", url: "" },
  options: { full_chip_erase: false },
};

function readiness(
  overrides: Partial<SerialReadinessResponse> = {},
  request: SerialReadinessRequest = DEFAULT_READINESS_REQUEST,
): SerialReadinessResponse {
  return {
    request_token: serialReadinessToken(request),
    session_status: { kind: "idle" as const },
    readiness: { kind: "advisory" as const },
    target_hint: null,
    validation_pending: false,
    bootloader_transition: { kind: "manual_bootloader_entry_required" as const },
    ...overrides,
  } satisfies SerialReadinessResponse;
}

function resolvedSerialReadiness(overrides: Partial<SerialReadinessResponse> = {}) {
  return vi.fn().mockImplementation(async (request: SerialReadinessRequest) => readiness(overrides, request));
}

function resolvedSerialReadinessSequence(...overridesList: Partial<SerialReadinessResponse>[]) {
  const mock = vi.fn();

  for (const overrides of overridesList) {
    mock.mockImplementationOnce(async (request: SerialReadinessRequest) => readiness(overrides, request));
  }

  const fallback = overridesList.length > 0 ? overridesList[overridesList.length - 1] : {};
  mock.mockImplementation(async (request: SerialReadinessRequest) => readiness(fallback, request));

  return mock;
}

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn() }));
vi.mock("../../firmware", async () => {
  const actual = await vi.importActual<typeof import("../../firmware")>("../../firmware");
  return {
    ...actual,
  };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.mocked(open).mockReset();
  vi.mocked(readFile).mockReset();
  vi.mocked(open).mockResolvedValue(null);
});

function makeFirmware(
  sessionStatus: FirmwareFlashWizardProps["firmware"]["sessionStatus"],
  overrides: Partial<FirmwareFlashWizardProps["firmware"]> = {},
): FirmwareFlashWizardProps["firmware"] {
  const fallbackRecoveryCatalogTargets = overrides.catalogTargets ?? vi.fn().mockResolvedValue([]);

  return {
    sessionStatus,
    progress: null,
    isActive: sessionStatus.kind === "serial_primary" || sessionStatus.kind === "dfu_recovery" || sessionStatus.kind === "cancelling",
    activePath: sessionStatus.kind === "cancelling"
      ? sessionStatus.path
      : sessionStatus.kind === "serial_primary" || sessionStatus.kind === "dfu_recovery"
        ? sessionStatus.kind
        : null,
    flashSerial: vi.fn(),
    flashDfuRecovery: vi.fn(),
    flashDfuFromApj: vi.fn(),
    flashDfuFromOfficialBootloader: vi.fn(),
    cancel: vi.fn(),
    dismiss: vi.fn(),
    preflight: vi.fn().mockResolvedValue({
      vehicle_connected: false,
      param_count: 0,
      has_params_to_backup: false,
      available_ports: [],
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" as const },
    }),
    serialReadiness: resolvedSerialReadiness(),
    listPorts: vi.fn().mockResolvedValue({ kind: "available", ports: [] }),
    listDfuDevices: vi.fn().mockResolvedValue({ kind: "available", devices: [] }),
    catalogTargets: vi.fn().mockResolvedValue([]),
    recoveryCatalogTargets: fallbackRecoveryCatalogTargets,
    catalogEntries: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as FirmwareFlashWizardProps["firmware"];
}

function renderCompletedSerialOutcome(outcome: SerialFlashOutcome) {
  return render(
    <FirmwareFlashWizard
      firmware={makeFirmware({
        kind: "completed",
        outcome: {
          path: "serial_primary",
          outcome,
        },
      })}
      connected={false}
    />,
  );
}

describe("FirmwareFlashWizard", () => {
  it("defaults DFU recovery to board target + official bootloader without a peer source chooser", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
        catalogEntries: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: "CubeOrange", manufacturer: "Hex" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-recovery-board-select")).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: /flash official bootloader/i })).toBeTruthy();
    expect(screen.getByDisplayValue("Choose official bootloader target…")).toBeTruthy();
    expect((screen.getByTestId("firmware-start-dfu") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("firmware-recovery-source-catalog")).toBeNull();
    expect(screen.queryByTestId("firmware-recovery-source-local-apj")).toBeNull();
    expect(screen.queryByTestId("firmware-recovery-source-local-bin")).toBeNull();
  });

  it("requires an explicit official bootloader target choice when multiple recovery targets exist", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
          { board_id: 9, platform: "fmuv2", brand_name: "Pixhawk", manufacturer: "3DR", vehicle_types: ["Plane"], latest_version: "4.4.0" },
        ]),
        flashDfuRecovery: vi.fn().mockResolvedValue({ result: "verified" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));
    await waitFor(() => expect(screen.getByTestId("firmware-recovery-board-select")).toBeTruthy());

    fireEvent.click(screen.getByLabelText(/i understand that dfu bootloader install bypasses normal safety checks/i));
    expect((screen.getByTestId("firmware-start-dfu") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId("firmware-recovery-board-select"), { target: { value: "1" } });
    expect((screen.getByTestId("firmware-start-dfu") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps manual APJ/BIN recovery inside an advanced section", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    });

    expect(screen.queryByText("Choose .apj file")).toBeNull();
    expect(screen.queryByText("Choose .bin file")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));

    expect(screen.getByText("Choose .apj file")).toBeTruthy();
    expect(screen.queryByText("Choose .bin file")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /use manual bin/i }));

    expect(screen.queryByText("Choose .apj file")).toBeNull();
    expect(screen.getByText("Choose .bin file")).toBeTruthy();
  });

  it("blocks manual APJ/BIN recovery until an extra manual confirmation is checked", async () => {
    vi.mocked(open).mockResolvedValueOnce("/tmp/recovery.apj");
    vi.mocked(readFile).mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]));

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));
    fireEvent.click(screen.getByRole("button", { name: /use manual apj/i }));
    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("recovery.apj")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText(/i understand that dfu bootloader install bypasses normal safety checks/i));

    await waitFor(() => {
      expect((screen.getByTestId("firmware-start-dfu") as HTMLButtonElement).disabled).toBe(true);
    });

    expect(screen.getByLabelText(/i confirm i am manually supplying the bootloader image/i)).toBeTruthy();
  });

  it("resets manual recovery confirmation when switching manual mode", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));
    await waitFor(() => expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));
    const confirm = screen.getByLabelText(/i confirm i am manually supplying the bootloader image/i) as HTMLInputElement;
    fireEvent.click(confirm);
    expect(confirm.checked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /use manual bin/i }));

    expect((screen.getByLabelText(/i confirm i am manually supplying the bootloader image/i) as HTMLInputElement).checked).toBe(false);
  });

  it("resets manual recovery confirmation when a new dangerous file is chosen", async () => {
    vi.mocked(open)
      .mockResolvedValueOnce("/tmp/first.bin")
      .mockResolvedValueOnce("/tmp/second.bin");
    vi.mocked(readFile)
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3]))
      .mockResolvedValueOnce(Uint8Array.from([4, 5, 6]));

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));
    await waitFor(() => expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));
    fireEvent.click(screen.getByRole("button", { name: /use manual bin/i }));
    fireEvent.click(screen.getByText("Choose .bin file"));
    await waitFor(() => expect(screen.getByText("first.bin")).toBeTruthy());

    const confirm = screen.getByLabelText(/i confirm i am manually supplying the bootloader image/i) as HTMLInputElement;
    fireEvent.click(confirm);
    expect(confirm.checked).toBe(true);

    fireEvent.click(screen.getByText("Choose .bin file"));
    await waitFor(() => expect(screen.getByText("second.bin")).toBeTruthy());

    expect((screen.getByLabelText(/i confirm i am manually supplying the bootloader image/i) as HTMLInputElement).checked).toBe(false);
  });

  it("clears manual APJ extflash blocking when switching back to official bootloader recovery", async () => {
    vi.mocked(open).mockResolvedValueOnce("/tmp/recovery.apj");
    vi.mocked(readFile).mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify({ extf_image: "abcd", extf_image_size: 4 })),
    );

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));
    fireEvent.click(screen.getByRole("button", { name: /use manual apj/i }));
    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-extf-block")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));
    fireEvent.click(screen.getByLabelText(/i understand that dfu bootloader install bypasses normal safety checks/i));
    fireEvent.change(screen.getByTestId("firmware-recovery-board-select"), { target: { value: "0" } });

    await waitFor(() => {
      expect(screen.queryByTestId("firmware-extf-block")).toBeNull();
      expect((screen.getByTestId("firmware-start-dfu") as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("starts the primary DFU flow with an official bootloader source built from the board target", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
        flashDfuRecovery: vi.fn().mockResolvedValue({ result: "verified" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-recovery-board-select")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("firmware-recovery-board-select"), { target: { value: "0" } });
    fireEvent.click(screen.getByLabelText(/i understand that dfu bootloader install bypasses normal safety checks/i));
    fireEvent.click(screen.getByTestId("firmware-start-dfu"));

    await waitFor(() => {
      expect(firmware.flashDfuRecovery).toHaveBeenCalledWith(
        { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" },
        { kind: "official_bootloader", board_target: "CubeOrange" },
      );
    });
  });

  it("keeps the selected DFU device stable by unique_id across rescan reordering", async () => {
    const listDfuDevices = vi.fn()
      .mockResolvedValueOnce({
        kind: "available",
        devices: [
          { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-a", serial_number: "A", manufacturer: "ST", product: "STM32 DFU A" },
          { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-b", serial_number: "B", manufacturer: "ST", product: "STM32 DFU B" },
        ],
      })
      .mockResolvedValueOnce({
        kind: "available",
        devices: [
          { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-b", serial_number: "B", manufacturer: "ST", product: "STM32 DFU B" },
          { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-a", serial_number: "A", manufacturer: "ST", product: "STM32 DFU A" },
        ],
      });

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices,
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
        flashDfuRecovery: vi.fn().mockResolvedValue({ result: "verified" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("STM32 DFU A (A)")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("STM32 DFU A (A)"), { target: { value: "dfu-b" } });
    fireEvent.click(screen.getByTitle("Scan for DFU devices"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("STM32 DFU B (B)")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("firmware-recovery-board-select"), { target: { value: "0" } });
    fireEvent.click(screen.getByLabelText(/i understand that dfu bootloader install bypasses normal safety checks/i));
    fireEvent.click(screen.getByTestId("firmware-start-dfu"));

    await waitFor(() => {
      expect(firmware.flashDfuRecovery).toHaveBeenCalledWith(
        { vid: 0x0483, pid: 0xdf11, unique_id: "dfu-b", serial_number: "B", manufacturer: "ST", product: "STM32 DFU B" },
        { kind: "official_bootloader", board_target: "CubeOrange" },
      );
    });
  });

  it("ignores stale serial catalog responses after a newer manual target selection", async () => {
    const first = deferred<FirmwareFlashWizardProps["firmware"]["catalogEntries"] extends (...args: any[]) => Promise<infer T> ? T : never>();
    const second = deferred<FirmwareFlashWizardProps["firmware"]["catalogEntries"] extends (...args: any[]) => Promise<infer T> ? T : never>();

    const catalogEntries = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: null, manufacturer: null, vehicle_types: ["Copter"], latest_version: "4.5.0" },
          { board_id: 9, platform: "fmuv2", brand_name: null, manufacturer: null, vehicle_types: ["Plane"], latest_version: "4.4.0" },
        ]),
        catalogEntries,
        serialReadiness: resolvedSerialReadiness({
          readiness: { kind: "blocked", reason: "source_missing" },
          target_hint: { detected_board_id: null },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => expect(screen.getByTestId("firmware-catalog-target-select")).toBeTruthy());

    fireEvent.change(screen.getByTestId("firmware-catalog-target-select"), { target: { value: "0" } });
    fireEvent.change(screen.getByTestId("firmware-catalog-target-select"), { target: { value: "1" } });

    second.resolve([
      { board_id: 9, platform: "fmuv2", vehicle_type: "Plane", version: "4.4.0", version_type: "stable", format: "apj", url: "https://example.com/fmuv2.apj", image_size: 123, latest: true, git_sha: "def", brand_name: null, manufacturer: null },
    ]);

    await waitFor(() => expect(screen.getByTestId("firmware-catalog-select")).toBeTruthy());
    expect(screen.getByText(/Plane 4.4.0 — fmuv2/i)).toBeTruthy();

    first.resolve([
      { board_id: 140, platform: "CubeOrange", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/cubeorange.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
    ]);

    await waitFor(() => {
      expect(screen.getByText(/Plane 4.4.0 — fmuv2/i)).toBeTruthy();
      expect(screen.queryByText(/Copter 4.5.0 — CubeOrange/i)).toBeNull();
    });
  });

  it("renders explicit official bootloader action copy and serial follow-up guidance", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: /flash official bootloader/i })).toBeTruthy();
    expect(screen.getByText(/writes a bootloader directly to internal flash from the stm32 flash base address/i)).toBeTruthy();
    expect(screen.getByText(/after the bootloader is restored, install normal ardupilot firmware through the serial install \/ update path/i)).toBeTruthy();
  });

  it("renders stronger manual recovery warnings about bootloader replacement and non-bootable outcomes", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        listDfuDevices: vi.fn().mockResolvedValue({
          kind: "available",
          devices: [{ vid: 0x0483, pid: 0xdf11, unique_id: "dfu-1", serial_number: null, manufacturer: "ST", product: "STM32 DFU" }],
        }),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-mode-recover"));

    await waitFor(() => {
      expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /manual apj\/bin source/i }));

    expect(screen.getByText(/manual local files may replace bootloader contents or leave the board non-bootable if the wrong image is used/i)).toBeTruthy();
  });

  it("keeps serial panel active and mode switching locked while serial cancellation is pending", () => {
    render(
      <FirmwareFlashWizard
        firmware={makeFirmware({ kind: "cancelling", path: "serial_primary" })}
        connected={false}
      />,
    );

    expect(screen.getByTestId("firmware-serial-panel")).toBeTruthy();
    expect(screen.getByText("Cancellation requested… waiting for serial flash to stop.")).toBeTruthy();
    expect((screen.getByTestId("firmware-mode-install") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("firmware-mode-recover") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("firmware-start-serial")).toBeNull();
  });

  it("keeps DFU panel active and mode switching locked while DFU remains active during checkpoint-only cancellation", () => {
    render(
      <FirmwareFlashWizard
        firmware={makeFirmware({ kind: "dfu_recovery", phase: "downloading" })}
        connected={false}
      />,
    );

    expect(screen.getByTestId("firmware-dfu-recovery-panel")).toBeTruthy();
    expect(screen.getByText("DFU bootloader install in progress…")).toBeTruthy();
    expect((screen.getByTestId("firmware-mode-install") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("firmware-mode-recover") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("firmware-start-dfu")).toBeNull();
  });

  it("renders reset_unconfirmed DFU outcome guidance", () => {
    render(
      <FirmwareFlashWizard
        firmware={makeFirmware({
          kind: "completed",
          outcome: {
            path: "dfu_recovery",
            outcome: { result: "reset_unconfirmed" },
          },
        })}
        connected={false}
      />,
    );

    expect(
      screen.getByText("DFU bootloader install completed, but device reset could not be confirmed. Reconnect or power-cycle the board before continuing."),
    ).toBeTruthy();
  });

  it("renders reconnect_verified success copy when flash verification succeeded", () => {
    renderCompletedSerialOutcome({
      result: "reconnect_verified",
      board_id: 9,
      bootloader_rev: 4,
      flash_verified: true,
    });

    expect(
      screen.getByText("Firmware flashed and verified successfully. The board reconnected after flashing and is ready."),
    ).toBeTruthy();
  });

  it("renders reconnect_verified unverified copy when reconnect succeeded but CRC verification did not", () => {
    renderCompletedSerialOutcome({
      result: "reconnect_verified",
      board_id: 9,
      bootloader_rev: 2,
      flash_verified: false,
    });

    expect(
      screen.getByText("Firmware was written and the board reconnected after flashing, but the flash could not be verified (bootloader does not support CRC check). Power-cycle the board to confirm."),
    ).toBeTruthy();
  });

  it("renders reconnect_failed warning copy with the reconnect error", () => {
    renderCompletedSerialOutcome({
      result: "reconnect_failed",
      board_id: 9,
      bootloader_rev: 4,
      flash_verified: true,
      reconnect_error: "timeout waiting for heartbeat",
    });

    expect(
      screen.getByText("Firmware was written, but reconnect verification failed: timeout waiting for heartbeat. Power-cycle the board to confirm."),
    ).toBeTruthy();
  });

  it("renders recovery-oriented board detection failure copy distinct from generic flash failures", () => {
    renderCompletedSerialOutcome({
      result: "board_detection_failed",
      reason: "no bootloader detected on the selected port",
    });

    expect(
      screen.getByText("Board detection failed: no bootloader detected on the selected port. If the board is unresponsive, try installing a bootloader via DFU below."),
    ).toBeTruthy();
    expect(screen.queryByText("Flash failed: no bootloader detected on the selected port")).toBeNull();
  });

  it("renders external-flash capacity copy distinct from generic flash failures", () => {
    renderCompletedSerialOutcome({
      result: "extf_capacity_insufficient",
      reason: "external flash requires 16 MiB but only 8 MiB is available",
    });

    expect(
      screen.getByText("The selected firmware requires more external flash capacity than this board provides: external flash requires 16 MiB but only 8 MiB is available. Use a build without the external-flash payload or perform a full-chip erase only on supported hardware."),
    ).toBeTruthy();
    expect(screen.queryByText("Flash failed: external flash requires 16 MiB but only 8 MiB is available")).toBeNull();
  });

  it("auto-returns verified DFU recovery to install/update with follow-up guidance", async () => {
    const dismiss = vi.fn();
    const preflight = vi.fn().mockResolvedValue({
      vehicle_connected: false,
      param_count: 0,
      has_params_to_backup: false,
      available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" as const },
    });
    const serialReadiness = resolvedSerialReadiness({
      readiness: { kind: "blocked", reason: "source_missing" },
      target_hint: { detected_board_id: null },
    });

    function Harness() {
      const [sessionStatus, setSessionStatus] = useState<FirmwareFlashWizardProps["firmware"]["sessionStatus"]>({
        kind: "completed",
        outcome: {
          path: "dfu_recovery",
          outcome: { result: "verified" },
        },
      });

      return (
        <FirmwareFlashWizard
          firmware={makeFirmware(sessionStatus, {
            dismiss: () => {
              dismiss();
              setSessionStatus({ kind: "idle" });
            },
            preflight,
            serialReadiness,
          })}
          connected={false}
        />
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByTestId("firmware-serial-panel")).toBeTruthy();
    });

    expect(
      screen.getByText("Bootloader recovery completed. Continue here with Install / Update to flash normal firmware."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /try again/i })).toBeNull();
  });

  it("reselects a replacement serial port after DFU verified auto-return when the old port disappears", async () => {
    const dismiss = vi.fn();
    const preflight = vi.fn()
      .mockResolvedValueOnce({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
        detected_board_id: null,
        session_ready: true,
        session_status: { kind: "idle" as const },
      })
      .mockResolvedValue({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: [{ port_name: "/dev/ttyACM1", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
        detected_board_id: null,
        session_ready: true,
        session_status: { kind: "idle" as const },
      });
    const serialReadiness = resolvedSerialReadiness({
      readiness: { kind: "blocked", reason: "source_missing" },
      target_hint: { detected_board_id: null },
    });

    function Harness() {
      const [sessionStatus, setSessionStatus] = useState<FirmwareFlashWizardProps["firmware"]["sessionStatus"]>({
        kind: "completed",
        outcome: {
          path: "dfu_recovery",
          outcome: { result: "verified" },
        },
      });

      return (
        <FirmwareFlashWizard
          firmware={makeFirmware(sessionStatus, {
            dismiss: () => {
              dismiss();
              setSessionStatus({ kind: "idle" });
            },
            preflight,
            serialReadiness,
          })}
          connected={false}
        />
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("/dev/ttyACM1")).toBeTruthy();
    });

    await waitFor(() => {
      expect(serialReadiness).toHaveBeenLastCalledWith({
        port: "/dev/ttyACM1",
        source: { kind: "catalog_url", url: "" },
        options: { full_chip_erase: false },
      });
    });
  });

  it("renders staged DFU phase labels before byte progress exists", () => {
    render(
      <FirmwareFlashWizard
        firmware={makeFirmware(
          { kind: "dfu_recovery", phase: "erasing" },
          { progress: { phase_label: "erasing", bytes_written: 0, bytes_total: 0, pct: 0 } },
        )}
        connected={false}
      />,
    );

    expect(screen.getByTestId("firmware-progress-bar")).toBeTruthy();
    expect(screen.getByText("erasing")).toBeTruthy();
    expect(screen.getByText("0%")).toBeTruthy();
  });

  it("uses backend serial readiness to keep serial start disabled", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogEntries: vi.fn().mockResolvedValue([{ board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null }]),
        serialReadiness: resolvedSerialReadiness({
          readiness: { kind: "blocked", reason: "port_unavailable" },
          target_hint: { detected_board_id: 140 },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(firmware.serialReadiness).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("threads full-chip-erase option into serial readiness and flash start", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogEntries: vi.fn().mockResolvedValue([{ board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null }]),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: 140 },
        }),
        flashSerial: vi.fn().mockResolvedValue({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(firmware.serialReadiness).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("firmware-full-chip-erase"));

    await waitFor(() => {
      expect(firmware.serialReadiness).toHaveBeenLastCalledWith({
        port: "/dev/ttyACM0",
        source: { kind: "catalog_url", url: "https://example.com/fw.apj" },
        options: { full_chip_erase: true },
      });
    });

    fireEvent.click(screen.getByTestId("firmware-start-serial"));

    await waitFor(() => {
      expect(firmware.flashSerial).toHaveBeenCalledWith(
        "/dev/ttyACM0",
        115200,
        { kind: "catalog_url", url: "https://example.com/fw.apj" },
        { full_chip_erase: true },
      );
    });
  });

  it("hides the connect prompt when serial readiness returns a bootloader-derived board id", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: "Hex", product: "CubeOrange Bootloader", location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: 140 },
        }),
        catalogEntries: vi.fn().mockResolvedValue([{ board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null }]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Board ID/i)).toBeTruthy();
    });

    expect(screen.queryByText(/Connect a flight controller to detect board identity/i)).toBeNull();
  });

  it("clears stale board/catalog state when selected port has no detected target hint", async () => {
    const serialReadiness = vi.fn().mockImplementation(async (request: SerialReadinessRequest) => {
      if (request.port === "/dev/ttyACM0") {
        return readiness({
          target_hint: { detected_board_id: 140 },
        }, request);
      }

      return readiness({
        readiness: { kind: "blocked", reason: request.port ? "port_unavailable" : "port_unselected" },
        target_hint: { detected_board_id: null },
      }, request);
    });

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [
            { port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
            { port_name: "/dev/ttyUSB1", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
          ],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogEntries: vi.fn().mockResolvedValue([{ board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null }]),
        serialReadiness,
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByText(/Board ID/)).toBeTruthy();
      expect(screen.getByTestId("firmware-catalog-select")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("/dev/ttyACM0"), { target: { value: "/dev/ttyUSB1" } });

    await waitFor(() => {
      expect(screen.queryByText(/Board ID/)).toBeNull();
      expect(screen.queryByTestId("firmware-catalog-select")).toBeNull();
    });
  });

  it("does not seed serial board identity from another port's preflight-wide detected_board_id", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [
            { port_name: "/dev/ttyUSB-selected", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
            { port_name: "/dev/ttyUSB-other", vid: null, pid: null, serial_number: null, manufacturer: "Hex", product: "CubeOrange", location: null },
          ],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: null },
          readiness: { kind: "blocked", reason: "source_missing" },
        }),
        catalogEntries: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(firmware.serialReadiness).toHaveBeenCalledWith({
        port: "/dev/ttyUSB-selected",
        source: { kind: "catalog_url", url: "" },
        options: { full_chip_erase: false },
      });
    });

    expect(screen.queryByText(/Board ID/)).toBeNull();
    expect(screen.queryByTestId("firmware-catalog-select")).toBeNull();
    expect(screen.getByText(/no usb board hint is available yet/i)).toBeTruthy();
  });

  it("does not allow serial flash to start with stale readiness after a native-fast port switch", async () => {
    const nextPortReadiness = deferred<SerialReadinessResponse>();

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [
            { port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
            { port_name: "/dev/ttyUSB1", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
          ],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogEntries: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
        ]),
        serialReadiness: vi.fn().mockImplementation(async (request: SerialReadinessRequest) => {
          if (request.port === "/dev/ttyACM0") {
            return readiness({
              target_hint: { detected_board_id: 140 },
            }, request);
          }

          return nextPortReadiness.promise;
        }),
        flashSerial: vi.fn().mockResolvedValue({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("firmware-catalog-select")).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
    });

    const portSelect = screen.getByDisplayValue("/dev/ttyACM0") as HTMLSelectElement;
    const startButton = screen.getByTestId("firmware-start-serial") as HTMLButtonElement;
    portSelect.value = "/dev/ttyUSB1";
    portSelect.dispatchEvent(new Event("change", { bubbles: true }));
    startButton.click();

    expect(firmware.flashSerial).not.toHaveBeenCalled();

    nextPortReadiness.resolve(readiness({
      session_status: { kind: "idle" },
      readiness: { kind: "blocked", reason: "port_unavailable" },
      target_hint: { detected_board_id: null },
      validation_pending: false,
      bootloader_transition: { kind: "manual_bootloader_entry_required" },
    }, {
      port: "/dev/ttyUSB1",
      source: { kind: "catalog_url", url: "https://example.com/fw.apj" },
      options: { full_chip_erase: false },
    }));

    await waitFor(() => {
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("does not allow serial flash to start with stale readiness after replacing a local APJ with a same-sized file", async () => {
    const nextFileReadiness = deferred<SerialReadinessResponse>();

    vi.mocked(open)
      .mockResolvedValueOnce("/tmp/first.apj")
      .mockResolvedValueOnce("/tmp/second.apj");
    vi.mocked(readFile)
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]))
      .mockResolvedValueOnce(Uint8Array.from([9, 8, 7, 6]));

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: vi.fn().mockImplementation(async (request: SerialReadinessRequest) => {
          if (request.source.kind === "local_apj_bytes" && request.source.data?.[0] === 1) {
            return readiness({
              target_hint: { detected_board_id: null },
            }, request);
          }

          return nextFileReadiness.promise;
        }),
        flashSerial: vi.fn().mockResolvedValue({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-source-local-apj"));
    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("first.apj")).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("second.apj")).toBeTruthy();
    });

    (screen.getByTestId("firmware-start-serial") as HTMLButtonElement).click();

    expect(firmware.flashSerial).not.toHaveBeenCalled();

    nextFileReadiness.resolve(readiness({
      session_status: { kind: "idle" },
      readiness: { kind: "blocked", reason: "source_missing" },
      target_hint: { detected_board_id: null },
      validation_pending: false,
      bootloader_transition: { kind: "manual_bootloader_entry_required" },
    }, {
      port: "/dev/ttyACM0",
      source: { kind: "local_apj_bytes", data: [9, 8, 7, 6] },
      options: { full_chip_erase: false },
    }));

    await waitFor(() => {
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("rejects a serial readiness response whose token still belongs to the previous port", async () => {
    vi.mocked(open).mockResolvedValueOnce("/tmp/firmware.apj");
    vi.mocked(readFile).mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]));

    const stalePortRequest: SerialReadinessRequest = {
      port: "/dev/ttyACM0",
      source: { kind: "local_apj_bytes", data: [1, 2, 3, 4] },
      options: { full_chip_erase: false },
    };

    const serialReadiness = vi.fn().mockImplementation(async (request: SerialReadinessRequest) => {
      if (request.source.kind === "local_apj_bytes" && request.source.data.length === 0) {
        return readiness({
          readiness: { kind: "blocked", reason: "source_missing" },
          target_hint: { detected_board_id: null },
        }, request);
      }

      if (request.port === "/dev/ttyACM0") {
        return readiness({
          target_hint: { detected_board_id: null },
        }, request);
      }

      return readiness({
        request_token: serialReadinessToken(stalePortRequest),
        target_hint: { detected_board_id: null },
      }, request);
    });

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [
            { port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
            { port_name: "/dev/ttyUSB1", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null },
          ],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness,
        flashSerial: vi.fn().mockResolvedValue({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyUSB1" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-source-local-apj"));
    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("firmware.apj")).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.change(screen.getByDisplayValue("/dev/ttyACM0"), { target: { value: "/dev/ttyUSB1" } });

    await waitFor(() => {
      expect(serialReadiness).toHaveBeenLastCalledWith({
        port: "/dev/ttyUSB1",
        source: { kind: "local_apj_bytes", data: [1, 2, 3, 4] },
        options: { full_chip_erase: false },
      });
    });

    await waitFor(() => {
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });

    fireEvent.click(screen.getByTestId("firmware-start-serial"));
    expect(firmware.flashSerial).not.toHaveBeenCalled();
  });

  it("keeps same-logical local APJ readiness fresh across identical file rerenders", async () => {
    vi.mocked(open)
      .mockResolvedValueOnce("/tmp/first.apj")
      .mockResolvedValueOnce("/tmp/second.apj");
    vi.mocked(readFile)
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]))
      .mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]));

    const logicalRequest: SerialReadinessRequest = {
      port: "/dev/ttyACM0",
      source: { kind: "local_apj_bytes", data: [1, 2, 3, 4] },
      options: { full_chip_erase: false },
    };

    const serialReadiness = vi.fn().mockImplementation(async (request: SerialReadinessRequest) => {
      if (request.source.kind === "local_apj_bytes" && request.source.data.length > 0) {
        return readiness({
          target_hint: { detected_board_id: null },
        }, request);
      }

      return readiness({
        readiness: { kind: "blocked", reason: "source_missing" },
        target_hint: { detected_board_id: null },
      }, request);
    });

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness,
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-source-local-apj"));
    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("first.apj")).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
    });

    expect(
      serialReadiness.mock.calls.filter(([request]) => JSON.stringify(request) === JSON.stringify(logicalRequest)),
    ).toHaveLength(1);

    fireEvent.click(screen.getByText("Choose .apj file"));

    await waitFor(() => {
      expect(screen.getByText("second.apj")).toBeTruthy();
    });

    expect(
      serialReadiness.mock.calls.filter(([request]) => JSON.stringify(request) === JSON.stringify(logicalRequest)),
    ).toHaveLength(1);
    expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
  });

  it("keeps catalog fallback blocked until the user explicitly chooses a manual target", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: "CubeOrange", manufacturer: "Hex", vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
        catalogEntries: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: "CubeOrange", manufacturer: "Hex" },
        ]),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: null },
          validation_pending: true,
        }),
        flashSerial: vi.fn().mockResolvedValue({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("firmware-catalog-target-select")).toBeTruthy();
      expect(screen.getByText(/no usb board hint is available yet/i)).toBeTruthy();
      expect(screen.queryByTestId("firmware-catalog-select")).toBeNull();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });

    fireEvent.change(screen.getByTestId("firmware-catalog-target-select"), { target: { value: "0" } });

    await waitFor(() => {
      expect(screen.getByTestId("firmware-catalog-select")).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByTestId("firmware-start-serial"));

    await waitFor(() => {
      expect(firmware.flashSerial).toHaveBeenCalledWith(
        "/dev/ttyACM0",
        115200,
        { kind: "catalog_url", url: "https://example.com/fw.apj" },
        { full_chip_erase: false },
      );
    });
  });

  it("degrades a detected board hint with no catalog entries into explicit manual target fallback", async () => {
    const catalogEntries = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { board_id: 200, platform: "ManualBoard", vehicle_type: "Copter", version: "4.5.1", version_type: "stable", format: "apj", url: "https://example.com/manual.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
      ]);

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 200, platform: "ManualBoard", brand_name: null, manufacturer: null, vehicle_types: ["Copter"], latest_version: "4.5.1" },
        ]),
        catalogEntries,
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: 140 },
          validation_pending: true,
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getAllByText((_, element) => element?.textContent === "Board ID 140 detected").length).toBeGreaterThan(0);
      expect(firmware.catalogTargets).toHaveBeenCalled();
    });

    expect(screen.queryByText(/^No firmware found for board ID 140$/i)).toBeNull();
    expect(catalogEntries).toHaveBeenCalledWith(140, undefined);
  });

  it("uses the serial target source for no-hint fallback instead of the DFU recovery target list", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 200, platform: "SerialOnlyBoard", brand_name: null, manufacturer: null, vehicle_types: ["Copter"], latest_version: "4.5.1" },
        ]),
        recoveryCatalogTargets: vi.fn().mockResolvedValue([]),
        catalogEntries: vi.fn().mockResolvedValue([
          { board_id: 200, platform: "SerialOnlyBoard", vehicle_type: "Copter", version: "4.5.1", version_type: "stable", format: "apj", url: "https://example.com/serial-only.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
        ]),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("firmware-catalog-target-select")).toBeTruthy();
      expect(screen.getByText(/SerialOnlyBoard/)).toBeTruthy();
      expect(screen.queryByTestId("firmware-catalog-select")).toBeNull();
    });

    expect(firmware.catalogTargets).toHaveBeenCalled();
    expect(firmware.recoveryCatalogTargets).not.toHaveBeenCalled();
  });

  it("preserves manual serial target platform choice when loading catalog entries", async () => {
    const catalogEntries = vi.fn()
      .mockResolvedValueOnce([
        { board_id: 140, platform: "CubeOrange", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/cubeorange.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null },
      ])
      .mockResolvedValueOnce([
        { board_id: 140, platform: "CubeOrangePlus", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/cubeorangeplus.apj", image_size: 123, latest: true, git_sha: "def", brand_name: null, manufacturer: null },
      ])
      .mockResolvedValue([
        { board_id: 140, platform: "CubeOrangePlus", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/cubeorangeplus.apj", image_size: 123, latest: true, git_sha: "def", brand_name: null, manufacturer: null },
      ]);

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([
          { board_id: 140, platform: "CubeOrange", brand_name: null, manufacturer: null, vehicle_types: ["Copter"], latest_version: "4.5.0" },
          { board_id: 140, platform: "CubeOrangePlus", brand_name: null, manufacturer: null, vehicle_types: ["Copter"], latest_version: "4.5.0" },
        ]),
        catalogEntries,
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("firmware-catalog-target-select")).toBeTruthy();
    });

    fireEvent.change(screen.getByTestId("firmware-catalog-target-select"), { target: { value: "1" } });

    await waitFor(() => {
      expect(catalogEntries).toHaveBeenCalledWith(140, "CubeOrangePlus");
      expect(screen.getByTestId("firmware-catalog-select")).toBeTruthy();
    });

    expect(catalogEntries).not.toHaveBeenCalledWith(140, "CubeOrange");
  });

  it("shows fallback catalog guidance when no USB hint exists before a manual target is chosen", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogTargets: vi.fn().mockResolvedValue([]),
        serialReadiness: resolvedSerialReadiness({
          readiness: { kind: "blocked", reason: "source_missing" },
          target_hint: { detected_board_id: null },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByText(/no usb board hint is available yet/i)).toBeTruthy();
      expect(screen.getByText(/choose a local apj if you do not want to wait for a manual catalog target list/i)).toBeTruthy();
      expect((screen.getByTestId("firmware-start-serial") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("refreshes readiness and guidance after a port refresh changes backend state", async () => {
    const readinessMock = resolvedSerialReadinessSequence(
      { bootloader_transition: { kind: "manual_bootloader_entry_required" as const } },
      { bootloader_transition: { kind: "already_in_bootloader" as const } },
      { bootloader_transition: { kind: "already_in_bootloader" as const } },
    );

    const preflightMock = vi.fn()
      .mockResolvedValueOnce({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
        detected_board_id: null,
        session_ready: true,
        session_status: { kind: "idle" as const },
      })
      .mockResolvedValueOnce({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: "Hex", product: "CubeOrange Bootloader", location: null }],
        detected_board_id: null,
        session_ready: true,
        session_status: { kind: "idle" as const },
      });

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: preflightMock,
        serialReadiness: readinessMock,
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByText(/requires manual bootloader entry/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle("Refresh ports"));

    await waitFor(() => {
      expect(readinessMock).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/already in bootloader/i)).toBeTruthy();
    });
  });

  it("refreshes readiness when connection state changes so auto-reboot guidance stays current", async () => {
    const readinessMock = resolvedSerialReadinessSequence(
      { bootloader_transition: { kind: "manual_bootloader_entry_required" as const } },
      { bootloader_transition: { kind: "auto_reboot_supported" as const } },
      { bootloader_transition: { kind: "auto_reboot_supported" as const } },
    );

    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: readinessMock,
      },
    );

    const view = render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    await waitFor(() => {
      expect(screen.getByText(/requires manual bootloader entry/i)).toBeTruthy();
    });

    view.rerender(<FirmwareFlashWizard firmware={firmware} connected={true} />);

    await waitFor(() => {
      expect(readinessMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/will auto-reboot into bootloader/i)).toBeTruthy();
    });
  });

  it("renders authoritative validation guidance for local APJ flashing too", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: resolvedSerialReadiness({
          validation_pending: true,
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);
    fireEvent.click(screen.getByTestId("firmware-source-local-apj"));

    await waitFor(() => {
      expect(screen.getByText(/validated after bootloader sync before erase/i)).toBeTruthy();
    });
  });

  it("renders auto-reboot guidance from backend readiness", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: true,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: 140,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        catalogEntries: vi.fn().mockResolvedValue([{ board_id: 140, platform: "fmuv3", vehicle_type: "Copter", version: "4.5.0", version_type: "stable", format: "apj", url: "https://example.com/fw.apj", image_size: 123, latest: true, git_sha: "abc", brand_name: null, manufacturer: null }]),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: 140 },
          validation_pending: true,
          bootloader_transition: { kind: "auto_reboot_supported" as const },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={true} />);

    await waitFor(() => {
      expect(screen.getByText(/will auto-reboot into bootloader/i)).toBeTruthy();
      expect(screen.getByText(/validated after bootloader sync before erase/i)).toBeTruthy();
    });
  });

  it("renders already-in-bootloader guidance while local serial flashing remains available without a USB hint", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: false,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyACM0", vid: null, pid: null, serial_number: null, manufacturer: "Hex", product: "CubeOrange Bootloader", location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: null },
          bootloader_transition: { kind: "already_in_bootloader" as const },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={false} />);

    fireEvent.click(screen.getByTestId("firmware-source-local-apj"));

    await waitFor(() => {
      expect(screen.getByText(/already in bootloader/i)).toBeTruthy();
      expect(screen.getByText(/Choose \.apj file/)).toBeTruthy();
    });
  });

  it("renders mismatched-target guidance without implying auto-reboot", async () => {
    const firmware = makeFirmware(
      { kind: "idle" },
      {
        preflight: vi.fn().mockResolvedValue({
          vehicle_connected: true,
          param_count: 0,
          has_params_to_backup: false,
          available_ports: [{ port_name: "/dev/ttyUSB1", vid: null, pid: null, serial_number: null, manufacturer: null, product: null, location: null }],
          detected_board_id: null,
          session_ready: true,
          session_status: { kind: "idle" as const },
        }),
        serialReadiness: resolvedSerialReadiness({
          target_hint: { detected_board_id: null },
          bootloader_transition: { kind: "target_mismatch" as const },
        }),
      },
    );

    render(<FirmwareFlashWizard firmware={firmware} connected={true} />);

    await waitFor(() => {
      expect(screen.getByText(/cannot safely prove the active mavlink link matches this serial port/i)).toBeTruthy();
    });

    expect(screen.queryByText(/will auto-reboot into bootloader/i)).toBeNull();
  });
});
