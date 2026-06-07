import type { FirmwareChecklistItem, FirmwareFlowStepState } from "./firmware-flow";

export type FirmwareRecoverySourceMode = "official" | "manual";

export type FirmwareRecoveryReviewInput = {
  actionsEnabled: boolean;
  layoutBlockedDetail: string | null;
  replayReadonly: boolean;
  deviceSelected: boolean;
  devicesVisible: boolean;
  scanLoading: boolean;
  sourceMode: FirmwareRecoverySourceMode;
  officialTargetSelected: boolean;
  sourceSelected: boolean;
  manualConfirmed: boolean;
  dfuConfirmed: boolean;
  blockedReason: string;
};

export function buildFirmwareRecoveryReviewChecklist(input: FirmwareRecoveryReviewInput): FirmwareChecklistItem[] {
  if (!input.actionsEnabled) {
    return [
      {
        label: "Desktop workspace available",
        state: "blocked",
        detail: input.layoutBlockedDetail ?? "Bootloader setup is disabled until a desktop-sized workspace is available.",
      },
    ];
  }

  if (input.replayReadonly) {
    return [
      {
        label: "Live setup session available",
        state: "blocked",
        detail: "Replay sessions are browse-only. Switch back to a live session before installing a bootloader.",
      },
    ];
  }

  const items: FirmwareChecklistItem[] = [
    input.deviceSelected
      ? { label: "DFU device selected", state: "ok", detail: "The controller in DFU mode is selected for bootloader setup." }
      : {
        label: "DFU device selected",
        state: input.scanLoading ? "pending" : "blocked",
        detail: input.devicesVisible
          ? "Choose the DFU device to install the bootloader onto."
          : "Connect the controller in DFU mode, then rescan.",
      },
  ];

  if (input.sourceMode === "official") {
    items.push(
      input.officialTargetSelected
        ? { label: "Official bootloader target selected", state: "ok", detail: "IronWing will install the official bootloader image for this target." }
        : { label: "Official bootloader target selected", state: "blocked", detail: "Choose the exact official target for this board." },
    );
  } else {
    items.push(
      input.sourceSelected
        ? { label: "Manual bootloader image selected", state: input.manualConfirmed ? "ok" : "blocked", detail: input.manualConfirmed ? "Manual image use is confirmed." : "Confirm that this APJ/BIN is the exact bootloader image for this board." }
        : { label: "Manual bootloader image selected", state: "blocked", detail: "Choose a validated APJ/BIN bootloader image." },
    );
  }

  items.push(
    input.sourceSelected
      ? { label: "Bootloader image selected", state: "ok", detail: input.sourceMode === "official" ? "Official bootloader source is armed." : "Manual bootloader source is armed." }
      : { label: "Bootloader image selected", state: "blocked", detail: input.blockedReason },
    input.dfuConfirmed
      ? { label: "DFU setup safety acknowledged", state: "ok", detail: "You understand this installs only the bootloader; flight firmware is installed next over serial." }
      : { label: "DFU setup safety acknowledged", state: "blocked", detail: "Acknowledge that this installs the bootloader only, not flight firmware." },
    {
      label: "Next step after bootloader setup",
      state: "warning",
      detail: "After verification, reconnect the board and continue to firmware install/update over serial.",
    },
  );

  return items;
}

export function resolveFirmwareRecoveryStepStates(input: Pick<FirmwareRecoveryReviewInput, "deviceSelected" | "sourceMode" | "officialTargetSelected" | "sourceSelected" | "manualConfirmed" | "dfuConfirmed">): {
  device: FirmwareFlowStepState;
  image: FirmwareFlowStepState;
  review: FirmwareFlowStepState;
} {
  const imageComplete = input.sourceMode === "official"
    ? input.officialTargetSelected && input.sourceSelected
    : input.sourceSelected && input.manualConfirmed;

  return {
    device: input.deviceSelected ? "complete" : "current",
    image: input.deviceSelected ? (imageComplete ? "complete" : "current") : "pending",
    review: input.deviceSelected && imageComplete ? (input.dfuConfirmed ? "complete" : "current") : "pending",
  };
}
