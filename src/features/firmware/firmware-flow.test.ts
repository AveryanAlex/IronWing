import { describe, expect, it } from "vitest";

import { buildFirmwareInstallReviewChecklist, resolveFirmwareInstallStepStates } from "./firmware-install-flow";
import { buildFirmwareRecoveryReviewChecklist, resolveFirmwareRecoveryStepStates } from "./firmware-recovery-flow";

describe("firmware flow helpers", () => {
  it("turns serial bootloader readiness into explicit install blockers", () => {
    const checklist = buildFirmwareInstallReviewChecklist({
      actionsEnabled: true,
      layoutBlockedDetail: null,
      replayReadonly: false,
      portSelected: true,
      readinessReady: false,
      readinessChecking: false,
      readinessDetail: "A live vehicle is connected on this port.",
      bootloaderStatusKind: "not_in_bootloader",
      sourceMode: "catalog",
      sourceReady: false,
      targetSelected: false,
      targetVisible: true,
      vehicleTypeSelected: false,
      versionSelected: false,
      paramBackupRecommended: true,
      fullChipErase: false,
    });

    expect(checklist.map((item) => [item.label, item.state])).toEqual(expect.arrayContaining([
      ["Bootloader serial port selected", "blocked"],
      ["Board target selected", "blocked"],
      ["Vehicle type selected", "blocked"],
      ["Firmware version selected", "blocked"],
      ["Firmware write readiness", "blocked"],
      ["Parameter backup recommended", "warning"],
    ]));
    expect(checklist[0]?.actionLabel).toBe("Reboot to bootloader");
  });

  it("marks install review current only after connection and firmware choices are complete", () => {
    expect(resolveFirmwareInstallStepStates({
      portSelected: true,
      bootloaderStatusKind: "already_in_bootloader",
      sourceMode: "catalog",
      sourceReady: true,
      targetSelected: true,
      vehicleTypeSelected: true,
      versionSelected: true,
      readinessReady: false,
    })).toEqual({
      connection: "complete",
      firmware: "complete",
      review: "current",
    });
  });

  it("keeps DFU bootloader setup ordered by device, image, then review", () => {
    expect(resolveFirmwareRecoveryStepStates({
      deviceSelected: false,
      sourceMode: "official",
      officialTargetSelected: true,
      sourceSelected: true,
      manualConfirmed: false,
      dfuConfirmed: false,
    })).toEqual({
      device: "current",
      image: "pending",
      review: "pending",
    });

    expect(resolveFirmwareRecoveryStepStates({
      deviceSelected: true,
      sourceMode: "official",
      officialTargetSelected: true,
      sourceSelected: true,
      manualConfirmed: false,
      dfuConfirmed: false,
    })).toEqual({
      device: "complete",
      image: "complete",
      review: "current",
    });
  });

  it("requires manual bootloader image confirmation but treats official DFU setup as normal", () => {
    const officialChecklist = buildFirmwareRecoveryReviewChecklist({
      actionsEnabled: true,
      layoutBlockedDetail: null,
      replayReadonly: false,
      deviceSelected: true,
      devicesVisible: true,
      scanLoading: false,
      sourceMode: "official",
      officialTargetSelected: true,
      sourceSelected: true,
      manualConfirmed: false,
      dfuConfirmed: false,
      blockedReason: "Acknowledge the DFU safety warning before installing the bootloader.",
    });
    const manualChecklist = buildFirmwareRecoveryReviewChecklist({
      actionsEnabled: true,
      layoutBlockedDetail: null,
      replayReadonly: false,
      deviceSelected: true,
      devicesVisible: true,
      scanLoading: false,
      sourceMode: "manual",
      officialTargetSelected: false,
      sourceSelected: true,
      manualConfirmed: false,
      dfuConfirmed: false,
      blockedReason: "Manual confirmation required.",
    });

    expect(officialChecklist.find((item) => item.label === "Official bootloader target selected")?.state).toBe("ok");
    expect(manualChecklist.find((item) => item.label === "Manual bootloader image selected")?.state).toBe("blocked");
  });
});
