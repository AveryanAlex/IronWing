import type { FirmwareInstallBootloaderStatus } from "../../firmware";
import type { FirmwareChecklistItem, FirmwareFlowStepState } from "./firmware-flow";

export type FirmwareInstallSourceMode = "catalog" | "local";

export type FirmwareInstallReviewInput = {
  actionsEnabled: boolean;
  layoutBlockedDetail: string | null;
  replayReadonly: boolean;
  portSelected: boolean;
  readinessReady: boolean;
  readinessChecking: boolean;
  readinessDetail: string;
  bootloaderStatusKind: FirmwareInstallBootloaderStatus["kind"] | "unknown";
  sourceMode: FirmwareInstallSourceMode;
  sourceReady: boolean;
  targetSelected: boolean;
  targetVisible: boolean;
  vehicleTypeSelected: boolean;
  versionSelected: boolean;
  paramBackupRecommended: boolean;
  fullChipErase: boolean;
};

export type FirmwareInstallStepStateInput = Pick<
  FirmwareInstallReviewInput,
  | "portSelected"
  | "bootloaderStatusKind"
  | "sourceMode"
  | "sourceReady"
  | "targetSelected"
  | "vehicleTypeSelected"
  | "versionSelected"
  | "readinessReady"
>;

export function installBootloaderStatusLabel(kind: FirmwareInstallBootloaderStatus["kind"] | "unknown"): string {
  switch (kind) {
    case "already_in_bootloader":
      return "Bootloader port ready";
    case "not_in_bootloader":
      return "Running MAVLink firmware";
    case "unknown":
      return "Port needs checking";
  }
}

export function installBootloaderStatusDetail(kind: FirmwareInstallBootloaderStatus["kind"] | "unknown"): string {
  switch (kind) {
    case "already_in_bootloader":
      return "The selected serial port appears to be the bootloader, so board autodetect and firmware install can proceed.";
    case "not_in_bootloader":
      return "The selected port is the live MAVLink link. Reboot it to bootloader, then select the re-enumerated bootloader port before flashing.";
    case "unknown":
      return "IronWing is not sure whether this serial port is a bootloader. Check the selected port with autodetect, or connect MAVLink first if the board is still running firmware.";
  }
}

export function installBootloaderStatusTone(kind: FirmwareInstallBootloaderStatus["kind"] | "unknown"): "success" | "warning" | "info" {
  switch (kind) {
    case "already_in_bootloader":
      return "success";
    case "not_in_bootloader":
      return "warning";
    case "unknown":
      return "info";
  }
}

export function buildFirmwareInstallReviewChecklist(input: FirmwareInstallReviewInput): FirmwareChecklistItem[] {
  if (!input.actionsEnabled) {
    return [
      {
        label: "Desktop workspace available",
        state: "blocked",
        detail: input.layoutBlockedDetail ?? "Firmware write actions are disabled until a desktop-sized workspace is available.",
      },
    ];
  }

  if (input.replayReadonly) {
    return [
      {
        label: "Live session available",
        state: "blocked",
        detail: "Replay sessions are browse-only. Switch back to a live session before flashing firmware.",
      },
    ];
  }

  const items: FirmwareChecklistItem[] = [
    input.portSelected
      ? {
        label: "Bootloader serial port selected",
        state: input.bootloaderStatusKind === "not_in_bootloader" ? "blocked" : "ok",
        detail: input.bootloaderStatusKind === "not_in_bootloader"
          ? "This port is still running MAVLink firmware. Reboot to bootloader first."
          : installBootloaderStatusLabel(input.bootloaderStatusKind),
        actionLabel: input.bootloaderStatusKind === "not_in_bootloader" ? "Reboot to bootloader" : undefined,
      }
      : {
        label: "Bootloader serial port selected",
        state: "blocked",
        detail: "Choose the serial port that represents the controller bootloader.",
      },
  ];

  if (input.sourceMode === "catalog") {
    items.push(
      input.targetSelected
        ? {
          label: "Board target selected",
          state: input.targetVisible ? "ok" : "blocked",
          detail: input.targetVisible
            ? "Official catalog entries are scoped to this board target."
            : "The selected board is hidden by the current search. Clear the search or select a visible board.",
        }
        : {
          label: "Board target selected",
          state: "blocked",
          detail: "Choose the exact board target from the official catalog, or use autodetect once the bootloader port is selected.",
        },
      input.vehicleTypeSelected
        ? { label: "Vehicle type selected", state: "ok", detail: "Firmware versions are filtered for this vehicle type." }
        : { label: "Vehicle type selected", state: "blocked", detail: "Choose Copter, Plane, Rover, or another vehicle type before selecting a release." },
      input.versionSelected
        ? { label: "Firmware version selected", state: "ok", detail: "An official APJ release is ready to install." }
        : { label: "Firmware version selected", state: "blocked", detail: "Choose the firmware release to install." },
    );
  } else {
    items.push(
      input.sourceReady
        ? { label: "Local APJ selected", state: "ok", detail: "The selected local APJ will be installed instead of a catalog release." }
        : { label: "Local APJ selected", state: "blocked", detail: "Choose a local APJ file before flashing." },
    );
  }

  items.push(
    input.readinessReady
      ? { label: "Firmware write readiness", state: "ok", detail: "Backend preflight checks are ready; compatibility is still verified after bootloader sync." }
      : {
        label: "Firmware write readiness",
        state: input.readinessChecking ? "pending" : "blocked",
        detail: input.readinessDetail,
      },
  );

  if (input.paramBackupRecommended) {
    items.push({
      label: "Parameter backup recommended",
      state: "warning",
      detail: "Flashing will break the current vehicle session. Save parameters first if you need to restore this setup.",
    });
  }

  items.push({
    label: "Full-chip erase",
    state: input.fullChipErase ? "warning" : "ok",
    detail: input.fullChipErase
      ? "Full-chip erase is enabled. Use it only when intentionally clearing the full external flash area."
      : "Disabled for a normal update.",
  });

  return items;
}

export function resolveFirmwareInstallStepStates(input: FirmwareInstallStepStateInput): {
  connection: FirmwareFlowStepState;
  firmware: FirmwareFlowStepState;
  review: FirmwareFlowStepState;
} {
  const connectionComplete = input.portSelected && input.bootloaderStatusKind !== "not_in_bootloader";
  const firmwareComplete = input.sourceMode === "local"
    ? input.sourceReady
    : input.targetSelected && input.vehicleTypeSelected && input.versionSelected && input.sourceReady;

  return {
    connection: connectionComplete ? "complete" : "current",
    firmware: connectionComplete ? (firmwareComplete ? "complete" : "current") : "pending",
    review: connectionComplete && firmwareComplete ? (input.readinessReady ? "complete" : "current") : "pending",
  };
}
