export const FIRMWARE_INSTALL_UPDATE_PLATFORM_UNSUPPORTED_GUIDANCE =
  "Firmware install/update needs WebSerial or desktop serial access. Use IronWing Desktop on Linux, macOS, or Windows, or open the web app in a Chromium-based browser with WebSerial enabled.";

export const FIRMWARE_INSTALL_UPDATE_ANDROID_UNSUPPORTED_GUIDANCE =
  "Firmware install/update over serial is not available in the Android app. Use IronWing Desktop on Linux, macOS, or Windows, or open the web app in Chrome or another Chromium-based browser with WebSerial enabled.";

export const FIRMWARE_INSTALL_UPDATE_WEB_UNSUPPORTED_GUIDANCE =
  "WebSerial is not available in this browser. Open the web app in Chrome, Edge, Brave, or another Chromium-based browser with WebSerial enabled, or download IronWing Desktop.";

export const WEB_SERIAL_FLASH_UNSUPPORTED_REASON =
  FIRMWARE_INSTALL_UPDATE_WEB_UNSUPPORTED_GUIDANCE;

export const BOOTLOADER_INSTALLATION_PLATFORM_UNSUPPORTED_GUIDANCE =
  "DFU bootloader setup needs USB DFU access. Use IronWing Desktop on Linux, macOS, or Windows, or open the web app in a Chromium-based browser with WebUSB enabled.";

export const BOOTLOADER_INSTALLATION_ANDROID_UNSUPPORTED_GUIDANCE =
  "DFU bootloader setup is not available in the Android app. Use IronWing Desktop on Linux, macOS, or Windows, or open the web app in Chrome or another Chromium-based browser with WebUSB enabled.";

export const BOOTLOADER_INSTALLATION_WEB_UNSUPPORTED_GUIDANCE =
  "WebUSB/DFU is not available in this browser. Open the web app in Chrome, Edge, Brave, or another Chromium-based browser with WebUSB enabled, or download IronWing Desktop.";

export const WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_REASON =
  BOOTLOADER_INSTALLATION_WEB_UNSUPPORTED_GUIDANCE;

export function firmwareInstallUpdatePlatformUnsupportedGuidance(reason?: string | null): string {
  if (reason && reason.trim().length > 0) {
    return reason;
  }

  if (isLikelyAndroidRuntime()) {
    return FIRMWARE_INSTALL_UPDATE_ANDROID_UNSUPPORTED_GUIDANCE;
  }

  return FIRMWARE_INSTALL_UPDATE_PLATFORM_UNSUPPORTED_GUIDANCE;
}

export function firmwareInstallUpdateErrorGuidance(message: string): string {
  return isPlatformUnsupportedFirmwareInstallUpdateMessage(message)
    ? firmwareInstallUpdatePlatformUnsupportedGuidance()
    : message;
}

export function bootloaderInstallationPlatformUnsupportedGuidance(reason?: string | null): string {
  if (reason && reason.trim().length > 0) {
    return reason;
  }

  if (isLikelyAndroidRuntime()) {
    return BOOTLOADER_INSTALLATION_ANDROID_UNSUPPORTED_GUIDANCE;
  }

  return BOOTLOADER_INSTALLATION_PLATFORM_UNSUPPORTED_GUIDANCE;
}

function isLikelyAndroidRuntime(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android/i.test(`${navigator.userAgent} ${navigator.platform}`);
}

function isPlatformUnsupportedFirmwareInstallUpdateMessage(message: string): boolean {
  return /firmware flashing not supported on this platform/i.test(message)
    || /firmware install\/update requires webserial/i.test(message)
    || /bootloader board autodetect requires webserial/i.test(message);
}
