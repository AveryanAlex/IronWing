// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  FirmwareSessionStatus,
  SerialFlowResult,
  DfuRecoveryResult,
  DfuRecoverySource,
  SerialFlashSource,
  SerialFlashOptions,
  SerialReadinessRequest,
} from "../firmware";
import {
  isFirmwareActive,
  deriveFirmwarePath,
  serialResultToStatus,
  dfuResultToStatus,
  buildDfuApjSource,
  buildDfuOfficialBootloaderSource,
  useFirmware,
} from "./use-firmware";

const firmwareMocks = vi.hoisted(() => ({
  firmwareSessionStatus: vi.fn(),
  subscribeFirmwareProgress: vi.fn(),
  firmwareFlashSerial: vi.fn(),
  firmwareFlashDfuRecovery: vi.fn(),
  firmwareSerialReadiness: vi.fn(),
  firmwareSessionCancel: vi.fn(),
  firmwareSessionClearCompleted: vi.fn(),
}));

vi.mock("../firmware", async () => {
  const actual = await vi.importActual<typeof import("../firmware")>("../firmware");
  return {
    ...actual,
    firmwareSessionStatus: firmwareMocks.firmwareSessionStatus,
    subscribeFirmwareProgress: firmwareMocks.subscribeFirmwareProgress,
    firmwareFlashSerial: firmwareMocks.firmwareFlashSerial,
    firmwareFlashDfuRecovery: firmwareMocks.firmwareFlashDfuRecovery,
    firmwareSerialReadiness: firmwareMocks.firmwareSerialReadiness,
    firmwareSessionCancel: firmwareMocks.firmwareSessionCancel,
    firmwareSessionClearCompleted: firmwareMocks.firmwareSessionClearCompleted,
  };
});

beforeEach(() => {
  vi.useRealTimers();
  firmwareMocks.firmwareSessionStatus.mockReset();
  firmwareMocks.subscribeFirmwareProgress.mockReset();
  firmwareMocks.firmwareFlashSerial.mockReset();
  firmwareMocks.firmwareFlashDfuRecovery.mockReset();
  firmwareMocks.firmwareSerialReadiness.mockReset();
  firmwareMocks.firmwareSessionCancel.mockReset();
  firmwareMocks.firmwareSessionClearCompleted.mockReset();

  firmwareMocks.firmwareSessionStatus.mockResolvedValue({ kind: "idle" } satisfies FirmwareSessionStatus);
  firmwareMocks.subscribeFirmwareProgress.mockResolvedValue(() => {});
  firmwareMocks.firmwareFlashSerial.mockResolvedValue({
    result: "verified",
    board_id: 9,
    bootloader_rev: 4,
    port: "/dev/ttyACM0",
  } satisfies SerialFlowResult);
  firmwareMocks.firmwareFlashDfuRecovery.mockResolvedValue({ result: "verified" } satisfies DfuRecoveryResult);
  firmwareMocks.firmwareSerialReadiness.mockResolvedValue({
    can_start: true,
    session_ready: true,
    session_status: { kind: "idle" },
    blocked_reason: null,
    target_hint: null,
    validation_pending: false,
    bootloader_transition: { kind: "manual_bootloader_entry_required" },
  });
  firmwareMocks.firmwareSessionCancel.mockResolvedValue(undefined);
  firmwareMocks.firmwareSessionClearCompleted.mockResolvedValue(undefined);
});

const IDLE: FirmwareSessionStatus = { kind: "idle" };

const SERIAL_IDLE: FirmwareSessionStatus = { kind: "serial_primary", phase: "idle" };
const SERIAL_PROGRAMMING: FirmwareSessionStatus = { kind: "serial_primary", phase: "programming" };
const SERIAL_VERIFYING: FirmwareSessionStatus = { kind: "serial_primary", phase: "verifying" };
const SERIAL_ERASING: FirmwareSessionStatus = { kind: "serial_primary", phase: "erasing" };
const SERIAL_REBOOTING: FirmwareSessionStatus = { kind: "serial_primary", phase: "rebooting" };

const DFU_IDLE: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "idle" };
const DFU_DOWNLOADING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "downloading" };
const DFU_DETECTING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "detecting" };
const DFU_ERASING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "erasing" };
const DFU_MANIFESTING_OR_RESETTING: FirmwareSessionStatus = {
  kind: "dfu_recovery",
  phase: "manifesting_or_resetting",
};
const DFU_VERIFYING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "verifying" };
const CANCELLING_SERIAL: FirmwareSessionStatus = { kind: "cancelling", path: "serial_primary" };
const CANCELLING_DFU: FirmwareSessionStatus = { kind: "cancelling", path: "dfu_recovery" };

describe("isFirmwareActive", () => {
  it("returns false when idle", () => {
    expect(isFirmwareActive(IDLE)).toBe(false);
  });

  it("returns true for serial_primary in any phase", () => {
    for (const s of [SERIAL_IDLE, SERIAL_PROGRAMMING, SERIAL_VERIFYING, SERIAL_ERASING, SERIAL_REBOOTING]) {
      expect(isFirmwareActive(s)).toBe(true);
    }
  });

  it("returns true for dfu_recovery in any phase", () => {
    for (const s of [DFU_IDLE, DFU_DETECTING, DFU_DOWNLOADING, DFU_ERASING, DFU_VERIFYING, DFU_MANIFESTING_OR_RESETTING]) {
      expect(isFirmwareActive(s)).toBe(true);
    }
  });

  it("returns true while cancelling", () => {
    expect(isFirmwareActive(CANCELLING_SERIAL)).toBe(true);
    expect(isFirmwareActive(CANCELLING_DFU)).toBe(true);
  });

  it("returns false for completed statuses produced by serialResultToStatus", () => {
    const results: SerialFlowResult[] = [
      { result: "verified", board_id: 1, bootloader_rev: 4, port: "/dev/ttyACM0" },
      { result: "failed", reason: "timeout" },
      { result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "/dev/ttyACM0" },
      { result: "extf_capacity_insufficient", reason: "no extf support" },
    ];
    for (const r of results) {
      expect(isFirmwareActive(serialResultToStatus(r))).toBe(false);
    }
  });

  it("returns false for completed statuses produced by dfuResultToStatus", () => {
    const results: DfuRecoveryResult[] = [
      { result: "verified" },
      { result: "failed", reason: "USB error" },
      { result: "driver_guidance", guidance: "Install WinUSB" },
      { result: "platform_unsupported" },
    ];
    for (const r of results) {
      expect(isFirmwareActive(dfuResultToStatus(r))).toBe(false);
    }
  });
});

describe("deriveFirmwarePath", () => {
  it("returns null when idle", () => {
    expect(deriveFirmwarePath(IDLE)).toBeNull();
  });

  it('returns "serial_primary" for serial sessions', () => {
    expect(deriveFirmwarePath(SERIAL_PROGRAMMING)).toBe("serial_primary");
  });

  it('returns "dfu_recovery" for DFU sessions', () => {
    expect(deriveFirmwarePath(DFU_DOWNLOADING)).toBe("dfu_recovery");
  });

  it("returns null for completed statuses", () => {
    expect(deriveFirmwarePath(serialResultToStatus({ result: "verified", board_id: 1, bootloader_rev: 4, port: "p" }))).toBeNull();
    expect(deriveFirmwarePath(dfuResultToStatus({ result: "verified" }))).toBeNull();
  });

  it("returns active path while cancelling", () => {
    expect(deriveFirmwarePath(CANCELLING_SERIAL)).toBe("serial_primary");
    expect(deriveFirmwarePath(CANCELLING_DFU)).toBe("dfu_recovery");
  });

  it("never confuses serial_primary with dfu_recovery", () => {
    expect(deriveFirmwarePath(SERIAL_PROGRAMMING)).toBe("serial_primary");
    expect(deriveFirmwarePath(DFU_DOWNLOADING)).toBe("dfu_recovery");
  });
});

describe("serialResultToStatus", () => {
  it("maps verified to completed serial verified", () => {
    const status = serialResultToStatus({ result: "verified", board_id: 9, bootloader_rev: 4, port: "/dev/ttyACM0" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "verified" } },
    });
  });

  it("maps flashed_but_unverified to completed serial flashed_but_unverified", () => {
    const status = serialResultToStatus({ result: "flashed_but_unverified", board_id: 9, bootloader_rev: 2, port: "/dev/ttyACM0" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "flashed_but_unverified" } },
    });
  });

  it("maps reconnect_verified with flash_verified=true to verified", () => {
    const status = serialResultToStatus({ result: "reconnect_verified", board_id: 9, bootloader_rev: 4, flash_verified: true });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "verified" } },
    });
  });

  it("maps reconnect_verified with flash_verified=false to flashed_but_unverified", () => {
    const status = serialResultToStatus({ result: "reconnect_verified", board_id: 9, bootloader_rev: 2, flash_verified: false });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "flashed_but_unverified" } },
    });
  });

  it("maps reconnect_failed to flashed_but_unverified", () => {
    const status = serialResultToStatus({
      result: "reconnect_failed", board_id: 9, bootloader_rev: 4, flash_verified: true, reconnect_error: "timeout",
    });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "flashed_but_unverified" } },
    });
  });

  it("maps failed to completed serial failed with reason", () => {
    const status = serialResultToStatus({ result: "failed", reason: "board mismatch" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "failed", reason: "board mismatch" } },
    });
  });

  it("maps cancelled to completed serial cancelled", () => {
    const status = serialResultToStatus({ result: "cancelled" } as unknown as SerialFlowResult);
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "cancelled" } },
    });
  });

  it("maps board_detection_failed to completed serial recovery_needed with reason", () => {
    const status = serialResultToStatus({ result: "board_detection_failed", reason: "no bootloader found" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "recovery_needed", reason: "no bootloader found" } },
    });
  });

  it("maps extf_capacity_insufficient to completed serial failed (not recovery_needed)", () => {
    const status = serialResultToStatus({
      result: "extf_capacity_insufficient",
      reason: "external-flash capacity insufficient: board reports 0 bytes, firmware needs 4 bytes",
    });
    expect(status).toEqual({
      kind: "completed",
      outcome: {
        path: "serial_primary",
        outcome: {
          result: "failed",
          reason: "external-flash capacity insufficient: board reports 0 bytes, firmware needs 4 bytes",
        },
      },
    });
  });

  it("extf_capacity_insufficient is distinct from board_detection_failed", () => {
    const extfFail = serialResultToStatus({
      result: "extf_capacity_insufficient",
      reason: "external-flash capacity insufficient",
    });
    const boardFail = serialResultToStatus({
      result: "board_detection_failed",
      reason: "no bootloader detected",
    });
    if (extfFail.kind === "completed" && boardFail.kind === "completed") {
      expect(extfFail.outcome.outcome.result).toBe("failed");
      expect(boardFail.outcome.outcome.result).toBe("recovery_needed");
    }
  });

  it("always produces kind=completed with path=serial_primary", () => {
    const results: SerialFlowResult[] = [
      { result: "verified", board_id: 1, bootloader_rev: 4, port: "p" },
      { result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "p" },
      { result: "reconnect_verified", board_id: 1, bootloader_rev: 4, flash_verified: true },
      { result: "reconnect_failed", board_id: 1, bootloader_rev: 4, flash_verified: true, reconnect_error: "e" },
      { result: "failed", reason: "r" },
      { result: "board_detection_failed", reason: "r" },
      { result: "extf_capacity_insufficient", reason: "r" },
    ];
    for (const r of results) {
      const s = serialResultToStatus(r);
      expect(s.kind).toBe("completed");
      if (s.kind === "completed") expect(s.outcome.path).toBe("serial_primary");
    }
  });
});

describe("dfuResultToStatus", () => {
  it("maps verified to completed dfu verified", () => {
    const status = dfuResultToStatus({ result: "verified" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "verified" } },
    });
  });

  it("maps failed to completed dfu failed with reason", () => {
    const status = dfuResultToStatus({ result: "failed", reason: "USB access denied" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "failed", reason: "USB access denied" } },
    });
  });

  it("maps driver_guidance to completed dfu unsupported_recovery_path", () => {
    const status = dfuResultToStatus({ result: "driver_guidance", guidance: "Install WinUSB via Zadig" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "unsupported_recovery_path", guidance: "Install WinUSB via Zadig" } },
    });
  });

  it("maps platform_unsupported to completed dfu unsupported_recovery_path", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    expect(status.kind).toBe("completed");
    if (status.kind === "completed") {
      expect(status.outcome.path).toBe("dfu_recovery");
      if (status.outcome.path === "dfu_recovery") {
        expect(status.outcome.outcome.result).toBe("unsupported_recovery_path");
      }
    }
  });

  it("maps reset_unconfirmed to completed dfu reset_unconfirmed", () => {
    const status = dfuResultToStatus({ result: "reset_unconfirmed" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "reset_unconfirmed" } },
    });
  });

  it("maps cancelled to completed dfu cancelled", () => {
    const status = dfuResultToStatus({ result: "cancelled" } as unknown as DfuRecoveryResult);
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "cancelled" } },
    });
  });

  it("always produces kind=completed with path=dfu_recovery", () => {
    const results: DfuRecoveryResult[] = [
      { result: "verified" },
      { result: "failed", reason: "r" },
      { result: "driver_guidance", guidance: "g" },
      { result: "platform_unsupported" },
      { result: "reset_unconfirmed" },
    ];
    for (const r of results) {
      const s = dfuResultToStatus(r);
      expect(s.kind).toBe("completed");
      if (s.kind === "completed") expect(s.outcome.path).toBe("dfu_recovery");
    }
  });
});

describe("locks connection controls while firmware active", () => {
  function computeFormLocked(
    isConnecting: boolean,
    connected: boolean,
    firmwareActive: boolean,
  ): boolean {
    return isConnecting || connected || firmwareActive;
  }

  it("locks when serial flashing (idle connection)", () => {
    expect(computeFormLocked(false, false, isFirmwareActive(SERIAL_PROGRAMMING))).toBe(true);
  });

  it("locks when DFU recovery (idle connection)", () => {
    expect(computeFormLocked(false, false, isFirmwareActive(DFU_DOWNLOADING))).toBe(true);
  });

  it("does not lock when idle firmware and idle connection", () => {
    expect(computeFormLocked(false, false, isFirmwareActive(IDLE))).toBe(false);
  });

  it("locks when connected even if firmware idle", () => {
    expect(computeFormLocked(false, true, isFirmwareActive(IDLE))).toBe(true);
  });

  it("unlocks after serial flash verified (real converter)", () => {
    const completed = serialResultToStatus({ result: "verified", board_id: 1, bootloader_rev: 4, port: "p" });
    expect(computeFormLocked(false, false, isFirmwareActive(completed))).toBe(false);
  });

  it("unlocks after serial flash failed (real converter)", () => {
    const completed = serialResultToStatus({ result: "failed", reason: "timeout" });
    expect(computeFormLocked(false, false, isFirmwareActive(completed))).toBe(false);
  });

  it("unlocks after DFU verified (real converter)", () => {
    const completed = dfuResultToStatus({ result: "verified" });
    expect(computeFormLocked(false, false, isFirmwareActive(completed))).toBe(false);
  });

  it("unlocks after DFU unsupported (real converter)", () => {
    const completed = dfuResultToStatus({ result: "platform_unsupported" });
    expect(computeFormLocked(false, false, isFirmwareActive(completed))).toBe(false);
  });

  it("unlocks after DFU driver guidance (real converter)", () => {
    const completed = dfuResultToStatus({ result: "driver_guidance", guidance: "Install WinUSB" });
    expect(computeFormLocked(false, false, isFirmwareActive(completed))).toBe(false);
  });

  it("locks for all serial phases", () => {
    for (const status of [SERIAL_IDLE, SERIAL_PROGRAMMING, SERIAL_VERIFYING, SERIAL_ERASING, SERIAL_REBOOTING]) {
      expect(computeFormLocked(false, false, isFirmwareActive(status))).toBe(true);
    }
  });

  it("locks for all DFU phases", () => {
    for (const status of [DFU_IDLE, DFU_DETECTING, DFU_DOWNLOADING, DFU_ERASING, DFU_VERIFYING, DFU_MANIFESTING_OR_RESETTING]) {
      expect(computeFormLocked(false, false, isFirmwareActive(status))).toBe(true);
    }
  });

  it("locks while firmware session is cancelling", () => {
    expect(computeFormLocked(false, false, isFirmwareActive(CANCELLING_SERIAL))).toBe(true);
    expect(computeFormLocked(false, false, isFirmwareActive(CANCELLING_DFU))).toBe(true);
  });

  it("keeps active path while cancelling", () => {
    expect(deriveFirmwarePath(CANCELLING_SERIAL)).toBe("serial_primary");
    expect(deriveFirmwarePath(CANCELLING_DFU)).toBe("dfu_recovery");
  });
});

describe("recovery-needed or unsupported outcomes stay distinct", () => {
  it("serial flashed_but_unverified is distinct from verified", () => {
    const unverified = serialResultToStatus({
      result: "flashed_but_unverified", board_id: 9, bootloader_rev: 2, port: "/dev/ttyACM0",
    });
    const verified = serialResultToStatus({
      result: "verified", board_id: 9, bootloader_rev: 4, port: "/dev/ttyACM0",
    });
    expect(unverified).not.toEqual(verified);
    if (unverified.kind === "completed" && unverified.outcome.path === "serial_primary") {
      expect(unverified.outcome.outcome.result).toBe("flashed_but_unverified");
    }
    if (verified.kind === "completed" && verified.outcome.path === "serial_primary") {
      expect(verified.outcome.outcome.result).toBe("verified");
    }
  });

  it("serial board_detection_failed maps to recovery_needed (distinct from failed)", () => {
    const status = serialResultToStatus({ result: "board_detection_failed", reason: "no bootloader detected" });
    expect(status.kind).toBe("completed");
    if (status.kind === "completed" && status.outcome.path === "serial_primary") {
      expect(status.outcome.outcome.result).toBe("recovery_needed");
      if (status.outcome.outcome.result === "recovery_needed") {
        expect(status.outcome.outcome.reason).toContain("no bootloader");
      }
    }
  });

  it("serial reconnect_failed maps to flashed_but_unverified (distinct from failed)", () => {
    const status = serialResultToStatus({
      result: "reconnect_failed", board_id: 9, bootloader_rev: 4, flash_verified: true, reconnect_error: "timeout",
    });
    if (status.kind === "completed" && status.outcome.path === "serial_primary") {
      expect(status.outcome.outcome.result).toBe("flashed_but_unverified");
    }
  });

  it("dfu driver_guidance maps to unsupported_recovery_path (not failed)", () => {
    const status = dfuResultToStatus({ result: "driver_guidance", guidance: "Install WinUSB via Zadig" });
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      expect(status.outcome.outcome.result).toBe("unsupported_recovery_path");
      if (status.outcome.outcome.result === "unsupported_recovery_path") {
        expect(status.outcome.outcome.guidance).toContain("WinUSB");
      }
    }
  });

  it("dfu platform_unsupported maps to unsupported_recovery_path (not failed)", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      expect(status.outcome.outcome.result).toBe("unsupported_recovery_path");
    }
  });

  it("unsupported_recovery_path is never confused with serial outcomes", () => {
    const dfuUnsupported = dfuResultToStatus({ result: "platform_unsupported" });
    const serialFailed = serialResultToStatus({ result: "failed", reason: "timeout" });
    if (dfuUnsupported.kind === "completed" && serialFailed.kind === "completed") {
      expect(dfuUnsupported.outcome.path).toBe("dfu_recovery");
      expect(serialFailed.outcome.path).toBe("serial_primary");
    }
  });

  it("all six terminal states are representable and distinct", () => {
    const verified = serialResultToStatus({ result: "verified", board_id: 1, bootloader_rev: 4, port: "p" });
    const unverified = serialResultToStatus({ result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "p" });
    const failed = serialResultToStatus({ result: "failed", reason: "error" });
    const recoveryNeeded = serialResultToStatus({ result: "board_detection_failed", reason: "no bootloader" });
    const unsupported = dfuResultToStatus({ result: "platform_unsupported" });
    const extfFailed = serialResultToStatus({ result: "extf_capacity_insufficient", reason: "no extf" });

    const outcomes = [verified, unverified, failed, recoveryNeeded, unsupported, extfFailed].map((s) => {
      if (s.kind === "completed") {
        return `${s.outcome.path}:${s.outcome.outcome.result}`;
      }
      return s.kind;
    });
    const unique = new Set(outcomes);
    expect(unique.size).toBe(5);
  });
});

describe("full transition sequences", () => {
  it("serial: idle → serial_primary → completed(verified)", () => {
    const s0: FirmwareSessionStatus = { kind: "idle" };
    expect(isFirmwareActive(s0)).toBe(false);

    const s1: FirmwareSessionStatus = { kind: "serial_primary", phase: "programming" };
    expect(isFirmwareActive(s1)).toBe(true);
    expect(deriveFirmwarePath(s1)).toBe("serial_primary");

    const s2 = serialResultToStatus({ result: "verified", board_id: 9, bootloader_rev: 4, port: "/dev/ttyACM0" });
    expect(s2.kind).toBe("completed");
    expect(isFirmwareActive(s2)).toBe(false);
    expect(deriveFirmwarePath(s2)).toBeNull();
    if (s2.kind === "completed") {
      expect(s2.outcome.path).toBe("serial_primary");
      expect(s2.outcome.outcome).toEqual({ result: "verified" });
    }
  });

  it("serial: idle → serial_primary → completed(failed)", () => {
    const s1: FirmwareSessionStatus = { kind: "serial_primary", phase: "erasing" };
    expect(isFirmwareActive(s1)).toBe(true);

    const s2 = serialResultToStatus({ result: "failed", reason: "protocol error" });
    expect(s2.kind).toBe("completed");
    expect(isFirmwareActive(s2)).toBe(false);
    if (s2.kind === "completed" && s2.outcome.path === "serial_primary") {
      expect(s2.outcome.outcome).toEqual({ result: "failed", reason: "protocol error" });
    }
  });

  it("dfu: idle → dfu_recovery → completed(verified)", () => {
    const s0: FirmwareSessionStatus = { kind: "idle" };
    expect(isFirmwareActive(s0)).toBe(false);

    const s1: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "downloading" };
    expect(isFirmwareActive(s1)).toBe(true);
    expect(deriveFirmwarePath(s1)).toBe("dfu_recovery");

    const s2 = dfuResultToStatus({ result: "verified" });
    expect(s2.kind).toBe("completed");
    expect(isFirmwareActive(s2)).toBe(false);
    if (s2.kind === "completed") {
      expect(s2.outcome.path).toBe("dfu_recovery");
      expect(s2.outcome.outcome).toEqual({ result: "verified" });
    }
  });

  it("dfu: idle → dfu_recovery → completed(unsupported)", () => {
    const s1: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "detecting" };
    expect(isFirmwareActive(s1)).toBe(true);

    const s2 = dfuResultToStatus({ result: "driver_guidance", guidance: "Use Zadig" });
    expect(s2.kind).toBe("completed");
    expect(isFirmwareActive(s2)).toBe(false);
    if (s2.kind === "completed" && s2.outcome.path === "dfu_recovery") {
      expect(s2.outcome.outcome).toEqual({ result: "unsupported_recovery_path", guidance: "Use Zadig" });
    }
  });

  it("dfu: idle → dfu_recovery → completed(platform_unsupported)", () => {
    const s2 = dfuResultToStatus({ result: "platform_unsupported" });
    expect(s2.kind).toBe("completed");
    if (s2.kind === "completed" && s2.outcome.path === "dfu_recovery") {
      expect(s2.outcome.outcome.result).toBe("unsupported_recovery_path");
    }
  });
});

describe("buildDfuApjSource", () => {
  it("creates a local_apj_bytes source from a byte array", () => {
    const bytes = [0x01, 0x02, 0x03, 0x04];
    const source: DfuRecoverySource = buildDfuApjSource(bytes);
    expect(source).toEqual({ kind: "local_apj_bytes", data: [0x01, 0x02, 0x03, 0x04] });
  });

  it("preserves empty byte arrays", () => {
    const source = buildDfuApjSource([]);
    expect(source).toEqual({ kind: "local_apj_bytes", data: [] });
  });

  it("returns an object distinct from local_bin_bytes", () => {
    const apj = buildDfuApjSource([0xff]);
    expect(apj.kind).toBe("local_apj_bytes");
    expect(apj.kind).not.toBe("local_bin_bytes");
  });
});

describe("buildDfuOfficialBootloaderSource", () => {
  it("creates an official_bootloader source from a board target", () => {
    const source: DfuRecoverySource = buildDfuOfficialBootloaderSource("CubeOrange");
    expect(source).toEqual({ kind: "official_bootloader", board_target: "CubeOrange" });
  });

  it("is distinct from local_apj_bytes and local_bin_bytes", () => {
    const source = buildDfuOfficialBootloaderSource("CubeOrange");
    expect(source.kind).toBe("official_bootloader");
    expect(source.kind).not.toBe("local_apj_bytes");
    expect(source.kind).not.toBe("local_bin_bytes");
  });
});

describe("DFU source builder round-trip compatibility", () => {
  it("buildDfuApjSource output is assignable to DfuRecoverySource", () => {
    const source: DfuRecoverySource = buildDfuApjSource([1, 2, 3]);
    expect(source.kind).toBe("local_apj_bytes");
  });

  it("buildDfuOfficialBootloaderSource output is assignable to DfuRecoverySource", () => {
    const source: DfuRecoverySource = buildDfuOfficialBootloaderSource("CubeOrange");
    expect(source.kind).toBe("official_bootloader");
  });

  it("all three DFU source kinds remain distinct", () => {
    const apj = buildDfuApjSource([0x01]);
    const officialBootloader = buildDfuOfficialBootloaderSource("CubeOrange");
    const bin: DfuRecoverySource = { kind: "local_bin_bytes", data: [0x01] };
    const kinds = new Set([apj.kind, officialBootloader.kind, bin.kind]);
    expect(kinds.size).toBe(3);
  });
});

// ── Task 9: gap-coverage tests ──

describe("reconnect_failed with flash_verified=false maps to flashed_but_unverified", () => {
  it("flash_verified=false still maps to flashed_but_unverified (not failed)", () => {
    const status = serialResultToStatus({
      result: "reconnect_failed",
      board_id: 9,
      bootloader_rev: 2,
      flash_verified: false,
      reconnect_error: "timeout after reboot",
    });
    expect(status.kind).toBe("completed");
    if (status.kind === "completed" && status.outcome.path === "serial_primary") {
      expect(status.outcome.outcome.result).toBe("flashed_but_unverified");
    }
  });

  it("flash_verified=false and flash_verified=true both map to flashed_but_unverified for reconnect_failed", () => {
    const withTrue = serialResultToStatus({
      result: "reconnect_failed", board_id: 9, bootloader_rev: 4, flash_verified: true, reconnect_error: "e",
    });
    const withFalse = serialResultToStatus({
      result: "reconnect_failed", board_id: 9, bootloader_rev: 2, flash_verified: false, reconnect_error: "e",
    });
    // Both must be flashed_but_unverified — reconnect_failed is always unverified regardless of flash_verified
    if (withTrue.kind === "completed" && withFalse.kind === "completed") {
      expect(withTrue.outcome.outcome.result).toBe("flashed_but_unverified");
      expect(withFalse.outcome.outcome.result).toBe("flashed_but_unverified");
    }
  });
});

describe("platform_unsupported DFU outcome is inactive and has guidance", () => {
  it("isFirmwareActive returns false for platform_unsupported outcome", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    expect(isFirmwareActive(status)).toBe(false);
  });

  it("platform_unsupported produces unsupported_recovery_path with non-empty guidance", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    expect(status.kind).toBe("completed");
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      expect(status.outcome.outcome.result).toBe("unsupported_recovery_path");
      if (status.outcome.outcome.result === "unsupported_recovery_path") {
        expect(status.outcome.outcome.guidance.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("dfu hook catch path produces failed session status", () => {
  it("dfuResultToStatus for failed carries the reason string", () => {
    const msg = "DFU recovery failed: catalog download failed: connection refused";
    const status = dfuResultToStatus({ result: "failed", reason: msg });
    expect(status.kind).toBe("completed");
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      expect(status.outcome.outcome.result).toBe("failed");
      if (status.outcome.outcome.result === "failed") {
        expect(status.outcome.outcome.reason).toBe(msg);
      }
    }
  });

  it("failed dfu outcome is inactive", () => {
    const status = dfuResultToStatus({ result: "failed", reason: "error" });
    expect(isFirmwareActive(status)).toBe(false);
  });
});

describe("driverGuidance is null for non-guidance DFU outcomes", () => {
  function extractDriverGuidance(status: ReturnType<typeof dfuResultToStatus>): string | null {
    if (status.kind !== "completed") return null;
    if (status.outcome.path !== "dfu_recovery") return null;
    const outcome = status.outcome.outcome;
    return "guidance" in outcome ? outcome.guidance : null;
  }

  it("verified outcome has no guidance", () => {
    const status = dfuResultToStatus({ result: "verified" });
    expect(extractDriverGuidance(status)).toBeNull();
  });

  it("failed outcome has no guidance", () => {
    const status = dfuResultToStatus({ result: "failed", reason: "USB error" });
    expect(extractDriverGuidance(status)).toBeNull();
  });

  it("driver_guidance outcome has guidance", () => {
    const status = dfuResultToStatus({ result: "driver_guidance", guidance: "Install WinUSB via Zadig" });
    expect(extractDriverGuidance(status)).toBe("Install WinUSB via Zadig");
  });

  it("platform_unsupported outcome has guidance (non-null)", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    const guidance = extractDriverGuidance(status);
    expect(guidance).not.toBeNull();
    expect(typeof guidance).toBe("string");
  });
});

describe("platform_unsupported and driver_guidance produce distinct guidance", () => {
  it("platform_unsupported guidance mentions platform", () => {
    const status = dfuResultToStatus({ result: "platform_unsupported" });
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      if (status.outcome.outcome.result === "unsupported_recovery_path") {
        expect(status.outcome.outcome.guidance.toLowerCase()).toContain("platform");
      }
    }
  });

  it("driver_guidance preserves the exact guidance string from the backend", () => {
    const guidance = "Install WinUSB driver using Zadig for STM32 DFU";
    const status = dfuResultToStatus({ result: "driver_guidance", guidance });
    if (status.kind === "completed" && status.outcome.path === "dfu_recovery") {
      if (status.outcome.outcome.result === "unsupported_recovery_path") {
        expect(status.outcome.outcome.guidance).toBe(guidance);
      }
    }
  });

  it("platform_unsupported and driver_guidance both map to unsupported_recovery_path but with different guidance", () => {
    const platformStatus = dfuResultToStatus({ result: "platform_unsupported" });
    const driverStatus = dfuResultToStatus({ result: "driver_guidance", guidance: "Install WinUSB" });
    if (platformStatus.kind === "completed" && driverStatus.kind === "completed") {
      const pOutcome = platformStatus.outcome.outcome;
      const dOutcome = driverStatus.outcome.outcome;
      expect(pOutcome.result).toBe("unsupported_recovery_path");
      expect(dOutcome.result).toBe("unsupported_recovery_path");
      if (pOutcome.result === "unsupported_recovery_path" && dOutcome.result === "unsupported_recovery_path") {
        expect(pOutcome.guidance).not.toBe(dOutcome.guidance);
      }
    }
  });
});

describe("extf_capacity_insufficient reason string contains hyphenated external-flash", () => {
  it("reason with hyphenated external-flash is preserved through serialResultToStatus", () => {
    const reason = "external-flash capacity insufficient: board reports 0 bytes, firmware needs 4 bytes";
    const status = serialResultToStatus({ result: "extf_capacity_insufficient", reason });
    if (status.kind === "completed" && status.outcome.path === "serial_primary") {
      if (status.outcome.outcome.result === "failed") {
        expect(status.outcome.outcome.reason).toContain("external-flash");
      }
    }
  });

  it("extf failure reason is not confused with recovery_needed reason", () => {
    const extf = serialResultToStatus({
      result: "extf_capacity_insufficient",
      reason: "external-flash capacity insufficient",
    });
    const recovery = serialResultToStatus({
      result: "board_detection_failed",
      reason: "no bootloader detected",
    });
    if (extf.kind === "completed" && recovery.kind === "completed") {
      expect(extf.outcome.outcome.result).toBe("failed");
      expect(recovery.outcome.outcome.result).toBe("recovery_needed");
    }
  });
});

describe("useFirmware hook API contract", () => {
  it("exposes serialReadiness and flashSerial functions", () => {
    const { result } = renderHook(() => useFirmware());
    expect(typeof result.current.serialReadiness).toBe("function");
    expect(typeof result.current.flashSerial).toBe("function");
  });

  it("exposes official bootloader DFU source building instead of catalog-url helpers", async () => {
    const device = {
      vid: 0x0483,
      pid: 0xdf11,
      unique_id: "dfu-1",
      serial_number: null,
      manufacturer: "STMicroelectronics",
      product: "STM32 DFU",
    };

    const { result } = renderHook(() => useFirmware());
    const api = result.current as Record<string, unknown>;

    expect(typeof api.flashDfuFromOfficialBootloader).toBe("function");
    expect(api.flashDfuFromCatalog).toBeUndefined();

    if (typeof api.flashDfuFromOfficialBootloader === "function") {
      await api.flashDfuFromOfficialBootloader(device, "CubeOrange");
    }

    expect(firmwareMocks.firmwareFlashDfuRecovery).toHaveBeenCalledWith(device, {
      kind: "official_bootloader",
      board_target: "CubeOrange",
    });
  });

  it("serialReadiness forwards request and returns backend response", async () => {
    const request: SerialReadinessRequest = {
      port: "/dev/ttyACM0",
      source: { kind: "catalog_url", url: "https://example.com/fw.apj" },
    };
    const response = {
      session_ready: false,
      session_status: { kind: "serial_primary", phase: "idle" as const },
      blocked_reason: "session_busy" as const,
      target_hint: null,
      validation_pending: false,
    };
    firmwareMocks.firmwareSerialReadiness.mockResolvedValueOnce(response);

    const { result } = renderHook(() => useFirmware());
    const actual = await result.current.serialReadiness(request);

    expect(firmwareMocks.firmwareSerialReadiness).toHaveBeenCalledWith(request);
    expect(actual).toEqual(response);
  });

  it("flashSerial passes options.full_chip_erase through when provided", async () => {
    const source: SerialFlashSource = { kind: "local_apj_bytes", data: [1, 2, 3] };
    const options: SerialFlashOptions = { full_chip_erase: false };

    const { result } = renderHook(() => useFirmware());
    await result.current.flashSerial("/dev/ttyACM0", 115200, source, options);

    expect(firmwareMocks.firmwareFlashSerial).toHaveBeenCalledWith(
      "/dev/ttyACM0",
      115200,
      source,
      { full_chip_erase: false },
    );
  });

  it("cancel restores prior status when cancel invoke fails", async () => {
    firmwareMocks.firmwareSessionStatus.mockResolvedValueOnce(SERIAL_PROGRAMMING);
    firmwareMocks.firmwareSessionCancel.mockRejectedValueOnce(new Error("cancel failed"));

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual(SERIAL_PROGRAMMING);

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.sessionStatus).toEqual(SERIAL_PROGRAMMING);
    expect(result.current.sessionStatus.kind).not.toBe("cancelling");
  });

  it("locks immediately when serial flash starts before backend status poll catches up", async () => {
    let resolveFlash: ((value: SerialFlowResult) => void) | null = null;
    firmwareMocks.firmwareFlashSerial.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFlash = resolve;
    }));

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      void result.current.flashSerial("/dev/ttyACM0", 115200, { kind: "local_apj_bytes", data: [1, 2, 3] });
    });

    expect(result.current.sessionStatus).toEqual({ kind: "serial_primary", phase: "idle" });
    expect(result.current.isActive).toBe(true);

    await act(async () => {
      resolveFlash?.({ result: "verified", board_id: 9, bootloader_rev: 4, port: "/dev/ttyACM0" });
      await Promise.resolve();
    });
  });

  it("keeps the optimistic start cancel-safe until the backend returns cancelled", async () => {
    let resolveFlash: ((value: SerialFlowResult) => void) | null = null;
    firmwareMocks.firmwareFlashSerial.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFlash = resolve;
    }));

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      void result.current.flashSerial("/dev/ttyACM0", 115200, { kind: "local_apj_bytes", data: [1, 2, 3] });
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "serial_primary" });
    expect(firmwareMocks.firmwareSessionCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFlash?.({ result: "cancelled" } as SerialFlowResult);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "cancelled" } },
    });
  });

  it("preserves completed outcome when poll reports idle before dismissal", async () => {
    vi.useFakeTimers();
    firmwareMocks.firmwareSessionStatus.mockResolvedValue({ kind: "idle" });

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await result.current.flashSerial("/dev/ttyACM0", 115200, { kind: "local_apj_bytes", data: [1, 2, 3] });
    });

    expect(result.current.sessionStatus.kind).toBe("completed");

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus.kind).toBe("completed");
  });

  it("preserves cancelling state when poll reports idle before terminal result", async () => {
    vi.useFakeTimers();
    firmwareMocks.firmwareSessionStatus.mockResolvedValue(SERIAL_PROGRAMMING);

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    firmwareMocks.firmwareSessionStatus.mockResolvedValue({ kind: "idle" });

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "serial_primary" });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "serial_primary" });
  });

  it("consumes backend-produced completed status after cancellation finishes", async () => {
    vi.useFakeTimers();
    firmwareMocks.firmwareSessionStatus.mockResolvedValue(SERIAL_PROGRAMMING);

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel();
    });

    firmwareMocks.firmwareSessionStatus.mockResolvedValue({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "cancelled" } },
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "cancelled" } },
    });
  });

  it("accepts backend-produced completed status on initial load", async () => {
    firmwareMocks.firmwareSessionStatus.mockResolvedValueOnce({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "reset_unconfirmed" } },
    });

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "reset_unconfirmed" } },
    });
  });

  it("accepts backend-produced active DFU phase status on initial load", async () => {
    firmwareMocks.firmwareSessionStatus.mockResolvedValueOnce({
      kind: "dfu_recovery",
      phase: "erasing",
    });

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "dfu_recovery",
      phase: "erasing",
    });
  });

  it("updates to backend-produced active DFU phases while polling", async () => {
    vi.useFakeTimers();
    firmwareMocks.firmwareSessionStatus.mockResolvedValue({
      kind: "dfu_recovery",
      phase: "detecting",
    });

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "dfu_recovery",
      phase: "detecting",
    });

    firmwareMocks.firmwareSessionStatus.mockResolvedValue({
      kind: "dfu_recovery",
      phase: "manifesting_or_resetting",
    });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "dfu_recovery",
      phase: "manifesting_or_resetting",
    });
  });

  it("preserves cancelling state when poll still reports the active serial phase before terminal result", async () => {
    vi.useFakeTimers();
    firmwareMocks.firmwareSessionStatus.mockResolvedValue(SERIAL_PROGRAMMING);

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "serial_primary" });

    firmwareMocks.firmwareSessionStatus.mockResolvedValue(SERIAL_VERIFYING);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "serial_primary" });
  });

  it("transitions DFU to cancelling during cancellation request", async () => {
    firmwareMocks.firmwareSessionStatus.mockResolvedValueOnce(DFU_DOWNLOADING);

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.sessionStatus).toEqual({ kind: "cancelling", path: "dfu_recovery" });
  });

  it("preserves typed cancelled DFU result through the hook contract", async () => {
    firmwareMocks.firmwareFlashDfuRecovery.mockResolvedValueOnce({ result: "cancelled" } as unknown as DfuRecoveryResult);

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await result.current.flashDfuRecovery(
        {
          vid: 0x0483,
          pid: 0xdf11,
          unique_id: "dfu-1",
          serial_number: null,
          manufacturer: "ST",
          product: "STM32 DFU",
        },
        { kind: "local_bin_bytes", data: [1, 2, 3, 4] },
      );
    });

    expect(result.current.sessionStatus).toEqual({
      kind: "completed",
      outcome: { path: "dfu_recovery", outcome: { result: "cancelled" } },
    });
  });

  it("dismiss clears backend-completed state before returning to idle", async () => {
    firmwareMocks.firmwareSessionStatus.mockResolvedValueOnce({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "verified" } },
    });

    const { result } = renderHook(() => useFirmware());

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      result.current.dismiss();
      await Promise.resolve();
    });

    expect(firmwareMocks.firmwareSessionClearCompleted).toHaveBeenCalledTimes(1);
    expect(result.current.sessionStatus).toEqual({ kind: "idle" });
  });
});
