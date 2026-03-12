import { describe, it, expect } from "vitest";
import type {
  FirmwareSessionStatus,
  SerialFlowResult,
  DfuRecoveryResult,
} from "../firmware";
import {
  isFirmwareActive,
  deriveFirmwarePath,
  serialResultToStatus,
  dfuResultToStatus,
} from "./use-firmware";

const IDLE: FirmwareSessionStatus = { kind: "idle" };

const SERIAL_IDLE: FirmwareSessionStatus = { kind: "serial_primary", phase: "idle" };
const SERIAL_PROGRAMMING: FirmwareSessionStatus = { kind: "serial_primary", phase: "programming" };
const SERIAL_VERIFYING: FirmwareSessionStatus = { kind: "serial_primary", phase: "verifying" };
const SERIAL_ERASING: FirmwareSessionStatus = { kind: "serial_primary", phase: "erasing" };
const SERIAL_REBOOTING: FirmwareSessionStatus = { kind: "serial_primary", phase: "rebooting" };

const DFU_IDLE: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "idle" };
const DFU_DOWNLOADING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "downloading" };
const DFU_DETECTING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "detecting" };
const DFU_VERIFYING: FirmwareSessionStatus = { kind: "dfu_recovery", phase: "verifying" };

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
    for (const s of [DFU_IDLE, DFU_DOWNLOADING, DFU_DETECTING, DFU_VERIFYING]) {
      expect(isFirmwareActive(s)).toBe(true);
    }
  });

  it("returns false for completed statuses produced by serialResultToStatus", () => {
    const results: SerialFlowResult[] = [
      { result: "verified", board_id: 1, bootloader_rev: 4, port: "/dev/ttyACM0" },
      { result: "failed", reason: "timeout" },
      { result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "/dev/ttyACM0" },
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

  it("maps board_detection_failed to completed serial recovery_needed with reason", () => {
    const status = serialResultToStatus({ result: "board_detection_failed", reason: "no bootloader found" });
    expect(status).toEqual({
      kind: "completed",
      outcome: { path: "serial_primary", outcome: { result: "recovery_needed", reason: "no bootloader found" } },
    });
  });

  it("always produces kind=completed with path=serial_primary", () => {
    const results: SerialFlowResult[] = [
      { result: "verified", board_id: 1, bootloader_rev: 4, port: "p" },
      { result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "p" },
      { result: "reconnect_verified", board_id: 1, bootloader_rev: 4, flash_verified: true },
      { result: "reconnect_failed", board_id: 1, bootloader_rev: 4, flash_verified: true, reconnect_error: "e" },
      { result: "failed", reason: "r" },
      { result: "board_detection_failed", reason: "r" },
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

  it("always produces kind=completed with path=dfu_recovery", () => {
    const results: DfuRecoveryResult[] = [
      { result: "verified" },
      { result: "failed", reason: "r" },
      { result: "driver_guidance", guidance: "g" },
      { result: "platform_unsupported" },
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
    for (const status of [DFU_IDLE, DFU_DOWNLOADING, DFU_DETECTING, DFU_VERIFYING]) {
      expect(computeFormLocked(false, false, isFirmwareActive(status))).toBe(true);
    }
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

  it("all five terminal states are representable and distinct", () => {
    const verified = serialResultToStatus({ result: "verified", board_id: 1, bootloader_rev: 4, port: "p" });
    const unverified = serialResultToStatus({ result: "flashed_but_unverified", board_id: 1, bootloader_rev: 2, port: "p" });
    const failed = serialResultToStatus({ result: "failed", reason: "error" });
    const recoveryNeeded = serialResultToStatus({ result: "board_detection_failed", reason: "no bootloader" });
    const unsupported = dfuResultToStatus({ result: "platform_unsupported" });

    const outcomes = [verified, unverified, failed, recoveryNeeded, unsupported].map((s) => {
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
