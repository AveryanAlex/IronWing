import {
    applyShellViewport,
    expect,
    test,
} from "./fixtures/mock-platform";
import {
    chooseLocalRecoveryFile,
    chooseLocalSerialApj,
    expectFirmwareWorkspace,
    expectOutcome,
    firmwareLocator,
    firmwareProgressEvent,
    openFirmwareWorkspace,
    queueFirmwareBinarySelection,
    rejectDeferredSerialFlash,
    resolveDeferredRecovery,
    resolveDeferredSerialFlash,
    selectManualTarget,
    waitForRecoveryStartEnabled,
    waitForSerialStartEnabled,
} from "./helpers/firmware-workspace";

const cubeOrangeCatalogRequest = {
    request: {
        port: "/dev/ttyACM0",
        baud: 115200,
        source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
        options: { full_chip_erase: false },
    },
} as const;

const defaultRecoveryRequest = {
    request: {
        device: {
            vid: 0x0483,
            pid: 0xdf11,
            unique_id: "mock-dfu-1",
            serial_number: "DFU0001",
            manufacturer: "STMicroelectronics",
            product: "STM32 BOOTLOADER",
        },
        source: { kind: "official_bootloader", board_target: "CubeOrange" },
    },
} as const;

test.describe("firmware workspace mocked-browser proof", () => {
    test("install failure keeps retry context after target-list and entry retries", async ({ page, mockPlatform }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();
        await mockPlatform.setCommandBehavior("firmware_catalog_targets", {
            type: "reject",
            error: "Could not load official targets from the serial catalog.",
        });

        await openFirmwareWorkspace(page);
        await expectFirmwareWorkspace(page);
        await expect(firmwareLocator(page, "targetListError")).toContainText(
            "Could not load official targets from the serial catalog.",
        );
        await expect(firmwareLocator(page, "startSerial")).toBeDisabled();

        await mockPlatform.clearCommandBehavior("firmware_catalog_targets");
        await mockPlatform.setCommandBehavior("firmware_catalog_entries", {
            type: "reject",
            error: "Could not load official APJ entries for Cube Orange.",
        });
        await firmwareLocator(page, "targetListRetry").click();
        await selectManualTarget(page, { searchText: "cube", targetName: /Cube Orange/i });
        await expect(firmwareLocator(page, "catalogEntryError")).toContainText(
            "Could not load official APJ entries for Cube Orange.",
        );
        await expect(firmwareLocator(page, "startSerial")).toBeDisabled();

        await mockPlatform.clearCommandBehavior("firmware_catalog_entries");
        await firmwareLocator(page, "catalogEntryRetry").click();
        await expect(firmwareLocator(page, "catalogEntrySelect")).toBeVisible();
        await waitForSerialStartEnabled(page);

        await mockPlatform.setCommandBehavior("firmware_flash_serial", {
            type: "reject",
            error: "serial bootloader handshake failed",
        });
        await firmwareLocator(page, "startSerial").click();

        await expectOutcome(page, {
            label: /Failed/i,
            summary: /serial bootloader handshake failed/i,
        });
        await expect(firmwareLocator(page, "selectedTargetState")).toContainText("manual");
        await expect(firmwareLocator(page, "selectedTargetState")).toContainText("Cube Orange");
        await expect(firmwareLocator(page, "selectedSourceState")).toContainText("catalog_url");
        await expect(firmwareLocator(page, "catalogEntrySelect")).toBeVisible();
        await waitForSerialStartEnabled(page);
        await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
            cmd: "firmware_flash_serial",
            args: cubeOrangeCatalogRequest,
        });
    });

    test("deferred serial cancel keeps the chosen retry context and surfaces a retained cancelled outcome", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();

        await openFirmwareWorkspace(page);
        await selectManualTarget(page, { searchText: "cube", targetName: /Cube Orange/i });
        await waitForSerialStartEnabled(page);

        await mockPlatform.setCommandBehavior("firmware_flash_serial", { type: "defer" });
        await firmwareLocator(page, "startSerial").click();

        await expect(firmwareLocator(page, "serialState")).toContainText(/active:/i);
        await expect(firmwareLocator(page, "cancelSerial")).toBeVisible();

        await firmwareLocator(page, "cancelSerial").click();
        await expect(firmwareLocator(page, "serialState")).toContainText("cancelling");
        await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
            cmd: "firmware_session_cancel",
            args: undefined,
        });

        await resolveDeferredSerialFlash(mockPlatform, { result: "cancelled" }, [
            firmwareProgressEvent({
                phase_label: "Cancelling install",
                bytes_written: 64,
                bytes_total: 128,
                pct: 50,
            }),
        ]);

        await expectOutcome(page, {
            label: /Cancelled/i,
            summary: /cancelled before completion/i,
        });
        await expect(firmwareLocator(page, "selectedTargetState")).toContainText("Cube Orange");
        await expect(firmwareLocator(page, "selectedSourceState")).toContainText("catalog_url");
        await waitForSerialStartEnabled(page);
    });

    test("validated local APJ selection drives serial flashing through the mock file-picker seam", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();

        await openFirmwareWorkspace(page);
        await selectManualTarget(page, { searchText: "cube", targetName: /Cube Orange/i });
        await waitForSerialStartEnabled(page);

        await expect(queueFirmwareBinarySelection(mockPlatform, {
            kind: "apj",
            fileName: "broken.bin",
            bytes: [1, 2, 3],
        })).rejects.toThrow(/must end with \.apj/i);
        await expect(queueFirmwareBinarySelection(mockPlatform, {
            kind: "apj",
            fileName: "bad.apj",
            bytes: [256],
        })).rejects.toThrow(/0\.\.255/i);

        const localBytes = await chooseLocalSerialApj(page, mockPlatform, {
            fileName: "cube-custom.apj",
            bytes: [1, 2, 3, 4],
        });
        await waitForSerialStartEnabled(page);
        await firmwareLocator(page, "startSerial").click();

        await expectOutcome(page, {
            label: /Verified/i,
            summary: /Firmware flashed and verified successfully\./i,
        });
        await expect.poll(async () => {
            const invocations = await mockPlatform.getInvocations();
            return invocations.find((entry) => entry.cmd === "firmware_flash_serial")?.args ?? null;
        }).toMatchObject({
            request: {
                port: "/dev/ttyACM0",
                baud: 115200,
                source: {
                    kind: "local_apj_bytes",
                    data: localBytes,
                    fileName: "cube-custom.apj",
                    byteLength: localBytes.length,
                },
                options: { full_chip_erase: false },
            },
        });
    });

    test("recovery retries target failures, proves manual BIN browsing, and auto-returns after verified DFU", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();
        await mockPlatform.setCommandBehavior("firmware_recovery_catalog_targets", {
            type: "reject",
            error: "Could not load official bootloader targets from the recovery catalog.",
        });

        await openFirmwareWorkspace(page);
        await firmwareLocator(page, "modeRecovery").click();

        await expect(firmwareLocator(page, "recoveryPanel")).toBeVisible();
        await expect(firmwareLocator(page, "recoveryTargetError")).toContainText(
            "Could not load official bootloader targets from the recovery catalog.",
        );
        await expect(firmwareLocator(page, "startRecovery")).toBeDisabled();

        await mockPlatform.clearCommandBehavior("firmware_recovery_catalog_targets");
        await firmwareLocator(page, "recoveryTargetRetry").click();
        await expect(firmwareLocator(page, "recoveryTargetSelect")).toBeVisible();

        await firmwareLocator(page, "recoveryAdvancedToggle").click();
        await firmwareLocator(page, "recoveryManualBin").click();
        await expect(queueFirmwareBinarySelection(mockPlatform, {
            kind: "bin",
            fileName: "broken.apj",
            bytes: [9, 8, 7, 6],
        })).rejects.toThrow(/must end with \.bin/i);
        await chooseLocalRecoveryFile(page, mockPlatform, {
            kind: "bin",
            fileName: "cube-rescue.bin",
            bytes: [9, 8, 7, 6],
        });
        await expect(firmwareLocator(page, "recoverySourceState")).toContainText("local_bin_bytes");
        await expect(firmwareLocator(page, "startRecovery")).toBeDisabled();

        await firmwareLocator(page, "recoveryOfficialAction").click();
        await expect(firmwareLocator(page, "recoverySourceState")).toContainText("official_bootloader");

        await mockPlatform.setCommandBehavior("firmware_flash_dfu_recovery", { type: "defer" });
        await firmwareLocator(page, "recoverySafetyConfirm").check();
        await waitForRecoveryStartEnabled(page);
        await firmwareLocator(page, "startRecovery").click();

        await expect(firmwareLocator(page, "recoveryState")).toContainText(/active:/i);
        await resolveDeferredRecovery(mockPlatform, { result: "verified" }, [
            firmwareProgressEvent({
                phase_label: "Recovering bootloader",
                bytes_written: 96,
                bytes_total: 128,
                pct: 75,
            }),
        ]);

        await expect(firmwareLocator(page, "mode")).toContainText("install-update");
        await expect(firmwareLocator(page, "serialPanel")).toBeVisible();
        await expect(firmwareLocator(page, "returnGuidance")).toContainText("Return to Install / Update now");
        await expectOutcome(page, {
            label: /Recovery verified/i,
            summary: /Return to Install \/ Update/i,
        });
        await expect(firmwareLocator(page, "outcomePanel")).toContainText("STM32 BOOTLOADER");
        await expect(firmwareLocator(page, "outcomePanel")).toContainText("Next step");
        await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
            cmd: "firmware_flash_dfu_recovery",
            args: defaultRecoveryRequest,
        });
    });

    test("radiomaster and phone widths stay browse-only while keeping firmware surfaces inspectable", async ({
        page,
        mockPlatform,
    }) => {
        await applyShellViewport(page, "radiomaster");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();

        await openFirmwareWorkspace(page);
        await selectManualTarget(page, { searchText: "cube", targetName: /Cube Orange/i });

        await expect(firmwareLocator(page, "layoutMode")).toContainText("browse-radiomaster");
        await expect(firmwareLocator(page, "blockedReason")).toContainText("Browse-only on constrained widths");
        await expect(firmwareLocator(page, "serialBlockedReason")).toContainText("firmware start remains desktop-only");
        await expect(firmwareLocator(page, "manualTargetSearch")).toBeVisible();
        await expect(firmwareLocator(page, "outcomePanel")).toBeVisible();
        await expect(firmwareLocator(page, "startSerial")).toBeDisabled();

        await firmwareLocator(page, "modeRecovery").click();
        await expect(firmwareLocator(page, "recoveryPanel")).toBeVisible();
        await expect(firmwareLocator(page, "startRecovery")).toBeDisabled();

        await applyShellViewport(page, "phone");
        await expect(firmwareLocator(page, "layoutMode")).toContainText("browse-phone");
        await expect(firmwareLocator(page, "blockedReason")).toContainText("Browse-only on phone widths");
        await expect(firmwareLocator(page, "recoveryGuidance")).toBeVisible();
        await expect(firmwareLocator(page, "recoveryBlockedReason")).toContainText("actual flash actions stay desktop-only");
        await expect(firmwareLocator(page, "startRecovery")).toBeDisabled();
    });

    test("deferred serial rejection fails loudly when the active install handshake breaks", async ({ page, mockPlatform }) => {
        await applyShellViewport(page, "desktop");
        await page.goto("/");
        await mockPlatform.reset();
        await mockPlatform.waitForRuntimeSurface();

        await openFirmwareWorkspace(page);
        await selectManualTarget(page, { searchText: "cube", targetName: /Cube Orange/i });
        await waitForSerialStartEnabled(page);

        await mockPlatform.setCommandBehavior("firmware_flash_serial", { type: "defer" });
        await firmwareLocator(page, "startSerial").click();
        await expect(firmwareLocator(page, "cancelSerial")).toBeVisible();

        await rejectDeferredSerialFlash(mockPlatform, "serial bootloader handshake failed", [
            firmwareProgressEvent({
                phase_label: "Syncing bootloader",
                bytes_written: 0,
                bytes_total: 128,
                pct: 0,
            }),
        ]);

        await expectOutcome(page, {
            label: /Failed/i,
            summary: /serial bootloader handshake failed/i,
        });
        await expect(firmwareLocator(page, "selectedTargetState")).toContainText("Cube Orange");
        await expect(firmwareLocator(page, "selectedSourceState")).toContainText("catalog_url");
        await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
            cmd: "firmware_flash_serial",
            args: cubeOrangeCatalogRequest,
        });
    });
});
