import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BOOTLOADER_INSTALLATION_ANDROID_UNSUPPORTED_GUIDANCE,
  BOOTLOADER_INSTALLATION_PLATFORM_UNSUPPORTED_GUIDANCE,
  FIRMWARE_INSTALL_UPDATE_ANDROID_UNSUPPORTED_GUIDANCE,
  FIRMWARE_INSTALL_UPDATE_PLATFORM_UNSUPPORTED_GUIDANCE,
  WEB_SERIAL_FLASH_UNSUPPORTED_REASON,
  bootloaderInstallationPlatformUnsupportedGuidance,
  firmwareInstallUpdateErrorGuidance,
  firmwareInstallUpdatePlatformUnsupportedGuidance,
} from "./platform-guidance";

describe("bootloader platform guidance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses backend-provided web guidance when available", () => {
    expect(bootloaderInstallationPlatformUnsupportedGuidance("Use Chrome or download the desktop app.")).toBe(
      "Use Chrome or download the desktop app.",
    );
  });

  it("uses Android-specific guidance when native Android returns an unsupported scan without reason", () => {
    vi.stubGlobal("navigator", {
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    });

    expect(bootloaderInstallationPlatformUnsupportedGuidance()).toBe(BOOTLOADER_INSTALLATION_ANDROID_UNSUPPORTED_GUIDANCE);
  });

  it("falls back to neutral desktop/web guidance without a platform hint", () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    });

    expect(bootloaderInstallationPlatformUnsupportedGuidance()).toBe(BOOTLOADER_INSTALLATION_PLATFORM_UNSUPPORTED_GUIDANCE);
  });
});

describe("firmware install/update platform guidance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses backend-provided WebSerial guidance when available", () => {
    expect(firmwareInstallUpdatePlatformUnsupportedGuidance(WEB_SERIAL_FLASH_UNSUPPORTED_REASON)).toBe(WEB_SERIAL_FLASH_UNSUPPORTED_REASON);
  });

  it("uses Android-specific guidance when native Android reports platform unsupported", () => {
    vi.stubGlobal("navigator", {
      platform: "Linux armv8l",
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    });

    expect(firmwareInstallUpdateErrorGuidance("firmware flashing not supported on this platform")).toBe(FIRMWARE_INSTALL_UPDATE_ANDROID_UNSUPPORTED_GUIDANCE);
  });

  it("falls back to neutral desktop/web guidance for unsupported install/update without a platform hint", () => {
    vi.stubGlobal("navigator", {
      platform: "Linux x86_64",
      userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
    });

    expect(firmwareInstallUpdateErrorGuidance("firmware flashing not supported on this platform")).toBe(FIRMWARE_INSTALL_UPDATE_PLATFORM_UNSUPPORTED_GUIDANCE);
  });
});
