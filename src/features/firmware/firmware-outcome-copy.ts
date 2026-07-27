import type { FirmwareOutcome } from "../../firmware";

export type FirmwareOutcomeTone = "success" | "warning" | "danger";

export type FirmwareOutcomeCopy = {
  tone: FirmwareOutcomeTone;
  label: string;
  summary: string;
};

export function firmwareOutcomeCopy(outcome: FirmwareOutcome): FirmwareOutcomeCopy {
  if (outcome.path === "bootloader_installation") {
    switch (outcome.outcome.result) {
      case "verified":
        return {
          tone: "success",
          label: "Bootloader installation verified",
          summary: "Bootloader installation completed. Return to firmware install/update and flash normal ArduPilot firmware over serial.",
        };
      case "cancelled":
        return {
          tone: "warning",
          label: "Bootloader installation cancelled",
          summary: "Bootloader installation was cancelled before completion.",
        };
      case "reset_unconfirmed":
        return {
          tone: "warning",
          label: "Reset unconfirmed",
          summary: "Bootloader installation completed, but device reset could not be confirmed. Reconnect or power-cycle the board before continuing.",
        };
      case "failed":
        return {
          tone: "danger",
          label: "Bootloader installation failed",
          summary: outcome.outcome.reason,
        };
      case "unsupported_bootloader_installation_path":
        return {
          tone: "warning",
          label: "Bootloader installation guidance",
          summary: outcome.outcome.guidance,
        };
    }
  }

  switch (outcome.outcome.result) {
    case "verified":
      return {
        tone: "success",
        label: "Firmware update verified",
        summary: "Firmware flashed and verified successfully.",
      };
    case "flashed_but_unverified":
      return {
        tone: "warning",
        label: "Firmware written, verification unavailable",
        summary: "Firmware was written, but the bootloader could not verify flash contents.",
      };
    case "reconnect_verified":
      return {
        tone: outcome.outcome.flash_verified ? "success" : "warning",
        label: outcome.outcome.flash_verified ? "Firmware reconnect verified" : "Reconnected without CRC proof",
        summary: outcome.outcome.flash_verified
          ? "The board reconnected after install and reported a verified flash."
          : "The board reconnected after install, but CRC verification was unavailable.",
      };
    case "reconnect_failed":
      return {
        tone: "warning",
        label: "Firmware reconnect failed",
        summary: `Firmware was written, but reconnect verification failed: ${outcome.outcome.reconnect_error}`,
      };
    case "cancelled":
      return {
        tone: "warning",
        label: "Firmware update cancelled",
        summary: "Firmware install/update was cancelled before completion.",
      };
    case "board_detection_failed":
      return {
        tone: "danger",
        label: "Firmware board detection failed",
        summary: outcome.outcome.reason,
      };
    case "extf_capacity_insufficient":
      return {
        tone: "danger",
        label: "External flash capacity insufficient",
        summary: outcome.outcome.reason,
      };
    case "failed":
      return {
        tone: "danger",
        label: "Firmware update failed",
        summary: outcome.outcome.reason,
      };
  }
}
