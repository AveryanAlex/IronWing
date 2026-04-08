import type { Locator, Page } from "@playwright/test";

import type { DfuRecoveryResult, FirmwareProgress, SerialFlowResult } from "../../src/firmware";
import type { MockPlatformEvent } from "../../src/platform/mock/backend";
import {
    expect,
    firmwareWorkspaceSelectors,
    type MockOpenFileState,
    type MockPlatformFixture,
} from "../fixtures/mock-platform";

export type FirmwareMockPlatform = Pick<
    MockPlatformFixture,
    | "clearCommandBehavior"
    | "getInvocations"
    | "getOpenFileState"
    | "rejectDeferred"
    | "resolveDeferred"
    | "setCommandBehavior"
    | "setOpenBinaryFile"
>;

export type FirmwareBinaryFixture = {
    kind: "apj" | "bin";
    fileName: string;
    bytes: Uint8Array | ArrayBuffer | number[];
    mimeType?: string;
};

function firmwareSelector(selector: keyof typeof firmwareWorkspaceSelectors): string {
    return firmwareWorkspaceSelectors[selector];
}

export function firmwareLocator(page: Page, selector: keyof typeof firmwareWorkspaceSelectors): Locator {
    return page.locator(firmwareSelector(selector));
}

export async function openFirmwareWorkspace(page: Page): Promise<void> {
    const firmwareButton = page.getByRole("button", { name: "Firmware" });
    await expect(
        firmwareButton,
        "Firmware workspace entry point is missing; keep the shared shell workspace labels aligned with the shipped header tabs.",
    ).toBeVisible();
    await firmwareButton.click();
    await expectFirmwareWorkspace(page);
}

export async function expectFirmwareWorkspace(page: Page): Promise<void> {
    await expect(
        firmwareLocator(page, "root"),
        "The firmware workspace root is missing; keep the shared firmware selectors in e2e/fixtures/mock-platform.ts aligned with the shipped workspace markup.",
    ).toBeVisible();
}

export async function filterManualTargets(page: Page, searchText: string): Promise<void> {
    const search = firmwareLocator(page, "manualTargetSearch");
    await expect(
        search,
        "The firmware manual target search field is missing; keep the shared helper aligned with the shipped firmware override surface.",
    ).toBeVisible();
    await search.fill(searchText);
}

export async function selectManualTarget(
    page: Page,
    options: { searchText?: string; targetName: string | RegExp },
): Promise<void> {
    if (options.searchText !== undefined) {
        await filterManualTargets(page, options.searchText);
    }

    const results = firmwareLocator(page, "manualTargetResults");
    await expect(
        results,
        "Manual target results did not render. Keep the browser proof aligned with the firmware override list instead of scraping fallback DOM.",
    ).toBeVisible();

    const target = results.getByRole("button", { name: options.targetName });
    await expect(
        target,
        `Firmware target ${String(options.targetName)} is missing from the manual override list.`,
    ).toBeVisible();

    const targetHandle = await target.elementHandle();
    if (!targetHandle) {
        throw new Error(
            `Firmware target ${String(options.targetName)} detached before selection could be dispatched. Keep the helper aligned with the manual target list lifecycle instead of relying on transient DOM state.`,
        );
    }

    await targetHandle.evaluate((element) => {
        (element as HTMLButtonElement).click();
    });
}

export async function waitForSerialStartEnabled(page: Page): Promise<void> {
    await expect(
        firmwareLocator(page, "startSerial"),
        "Serial install never became startable; check target proof, source selection, readiness copy, and constrained-tier blocking before assuming the workspace is ready.",
    ).toBeEnabled();
}

export async function waitForRecoveryStartEnabled(page: Page): Promise<void> {
    await expect(
        firmwareLocator(page, "startRecovery"),
        "DFU recovery never became startable; check device selection, source confirmation, and blocked guidance before assuming the rescue path is armed.",
    ).toBeEnabled();
}

export async function expectOutcome(
    page: Page,
    options: { label: string | RegExp; summary?: string | RegExp },
): Promise<void> {
    await expect(
        firmwareLocator(page, "outcomeResult"),
        "Firmware outcome result is missing; the retained outcome panel must stay mounted for deterministic browser proof.",
    ).toContainText(options.label);

    if (options.summary !== undefined) {
        await expect(
            firmwareLocator(page, "outcomeSummary"),
            "Firmware outcome summary is missing; keep the retained outcome copy stable enough for explicit browser assertions.",
        ).toContainText(options.summary);
    }
}

export function firmwareProgressEvent(progress: Partial<FirmwareProgress> = {}): MockPlatformEvent {
    return {
        event: "firmware://progress",
        payload: {
            phase_label: progress.phase_label ?? "Mock firmware progress",
            bytes_written: progress.bytes_written ?? 64,
            bytes_total: progress.bytes_total ?? 128,
            pct: progress.pct ?? 50,
        } satisfies FirmwareProgress,
    };
}

export async function resolveDeferredSerialFlash(
    mockPlatform: FirmwareMockPlatform,
    result: SerialFlowResult,
    emit: MockPlatformEvent[] = [],
): Promise<void> {
    const resolved = await mockPlatform.resolveDeferred("firmware_flash_serial", result, emit);
    expect(
        resolved,
        "No deferred firmware_flash_serial invocation was waiting to resolve. Keep the test flow tied to an active serial start instead of resolving hidden state opportunistically.",
    ).toBe(true);
}

export async function rejectDeferredSerialFlash(
    mockPlatform: FirmwareMockPlatform,
    error: string,
    emit: MockPlatformEvent[] = [],
): Promise<void> {
    const rejected = await mockPlatform.rejectDeferred("firmware_flash_serial", error, emit);
    expect(
        rejected,
        "No deferred firmware_flash_serial invocation was waiting to reject. Keep the test flow tied to an active serial start instead of rejecting hidden state opportunistically.",
    ).toBe(true);
}

export async function resolveDeferredRecovery(
    mockPlatform: FirmwareMockPlatform,
    result: DfuRecoveryResult,
    emit: MockPlatformEvent[] = [],
): Promise<void> {
    const resolved = await mockPlatform.resolveDeferred("firmware_flash_dfu_recovery", result, emit);
    expect(
        resolved,
        "No deferred firmware_flash_dfu_recovery invocation was waiting to resolve. Keep the recovery proof tied to an active DFU start instead of resolving hidden state opportunistically.",
    ).toBe(true);
}

function normalizeFirmwareFixtureBytes(bytes: FirmwareBinaryFixture["bytes"]): number[] {
    if (bytes instanceof Uint8Array) {
        return [...bytes];
    }

    if (bytes instanceof ArrayBuffer) {
        return [...new Uint8Array(bytes)];
    }

    if (!Array.isArray(bytes)) {
        throw new Error("Firmware fixture bytes must be provided as number[], Uint8Array, or ArrayBuffer.");
    }

    for (const [index, value] of bytes.entries()) {
        if (!Number.isInteger(value) || value < 0 || value > 0xff) {
            throw new Error(
                `Firmware fixture byte at index ${index} must be an integer in 0..255. Received ${String(value)}.`,
            );
        }
    }

    return [...bytes];
}

function validateFirmwareFixtureName(kind: FirmwareBinaryFixture["kind"], fileName: string): string {
    const normalized = fileName.trim();
    if (normalized.length === 0) {
        throw new Error("Firmware fixture fileName must be a non-empty string.");
    }

    const requiredExtension = `.${kind}`;
    if (!normalized.toLowerCase().endsWith(requiredExtension)) {
        throw new Error(
            `Firmware fixture ${JSON.stringify(normalized)} must end with ${requiredExtension} so the shipped file loader follows the same branch as production.`,
        );
    }

    return normalized;
}

export async function queueFirmwareBinarySelection(
    mockPlatform: FirmwareMockPlatform,
    fixture: FirmwareBinaryFixture,
): Promise<FirmwareBinaryFixture & { bytes: number[] }> {
    const fileName = validateFirmwareFixtureName(fixture.kind, fixture.fileName);
    const bytes = normalizeFirmwareFixtureBytes(fixture.bytes);
    const mimeType = fixture.mimeType ?? "application/octet-stream";

    await mockPlatform.setOpenBinaryFile(bytes, fileName, mimeType);

    return {
        ...fixture,
        fileName,
        bytes,
        mimeType,
    };
}

async function readOpenFileState(mockPlatform: FirmwareMockPlatform): Promise<MockOpenFileState> {
    const state = await mockPlatform.getOpenFileState();
    if (!state || typeof state !== "object") {
        throw new Error("Mock file picker did not return a readable state object.");
    }

    return state;
}

async function waitForOpenFileCount(mockPlatform: FirmwareMockPlatform, openCount: number): Promise<void> {
    await expect.poll(
        async () => {
            const state = await readOpenFileState(mockPlatform);
            return state.openCount;
        },
        {
            message: `Expected the firmware file picker open count to reach ${openCount}; keep tests tied to the shared file-picker seam instead of assuming browse clicks succeeded.`,
        },
    ).toBe(openCount);
}

export async function chooseLocalSerialApj(
    page: Page,
    mockPlatform: FirmwareMockPlatform,
    fixture: Omit<FirmwareBinaryFixture, "kind">,
): Promise<number[]> {
    const openStateBefore = await readOpenFileState(mockPlatform);
    const queued = await queueFirmwareBinarySelection(mockPlatform, { ...fixture, kind: "apj" });

    await firmwareLocator(page, "sourceBrowse").click();
    await waitForOpenFileCount(mockPlatform, openStateBefore.openCount + 1);
    await expect(firmwareLocator(page, "selectedSourceState")).toContainText("local_apj_bytes");
    await expect(firmwareLocator(page, "selectedSourceState")).toContainText(queued.fileName);

    return queued.bytes;
}

export async function chooseLocalRecoveryFile(
    page: Page,
    mockPlatform: FirmwareMockPlatform,
    fixture: FirmwareBinaryFixture,
): Promise<number[]> {
    const openStateBefore = await readOpenFileState(mockPlatform);
    const queued = await queueFirmwareBinarySelection(mockPlatform, fixture);

    await firmwareLocator(page, "recoveryBrowse").click();
    await waitForOpenFileCount(mockPlatform, openStateBefore.openCount + 1);
    await expect(firmwareLocator(page, "recoverySourceState")).toContainText(
        queued.kind === "apj" ? "local_apj_bytes" : "local_bin_bytes",
    );
    await expect(firmwareLocator(page, "recoverySourceState")).toContainText(queued.fileName);

    return queued.bytes;
}
