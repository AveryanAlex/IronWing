import { test, expect } from "./fixtures/mock-platform";

const desktopTargets = [
  {
    board_id: 140,
    platform: "CubeOrange",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
    vehicle_types: ["Copter", "Plane"],
    latest_version: "4.5.0",
  },
  {
    board_id: 9,
    platform: "fmuv2",
    brand_name: null,
    manufacturer: null,
    vehicle_types: ["Plane"],
    latest_version: "4.4.0",
  },
];

test.describe("standalone firmware tab", () => {
  test("desktop nav reaches the standalone tab and keeps manual catalog override usable", async ({ page, mockPlatform }) => {
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("firmware_catalog_targets", { type: "defer" });
    await mockPlatform.setCommandBehavior("firmware_flash_serial", {
      type: "reject",
      error: "serial bootloader handshake failed",
    });

    await page.getByRole("button", { name: "Firmware" }).click();

    await expect(page.locator('[data-testid="firmware-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="firmware-catalog-target-chooser"]')).toBeVisible();
    await expect(page.getByText("Loading supported targets…")).toBeVisible();
    await expect(page.locator('[data-testid="firmware-start-serial"]')).toBeDisabled();

    expect(await mockPlatform.resolveDeferred("firmware_catalog_targets", desktopTargets)).toBe(true);

    const search = page.locator('[data-testid="firmware-catalog-target-search"]');
    await search.fill("cube");

    const cubeTarget = page
      .locator('[data-testid="firmware-catalog-target-results"] button')
      .filter({ hasText: /Cube Orange/i })
      .first();
    await expect(cubeTarget).toBeVisible();
    await cubeTarget.click();

    await expect(page.locator('[data-testid="firmware-catalog-target-selected"]')).toContainText("Cube Orange");
    await expect(page.locator('[data-testid="firmware-catalog-select"]')).toBeVisible();
    await expect(page.locator('[data-testid="firmware-start-serial"]')).toBeEnabled();

    await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
      cmd: "firmware_catalog_entries",
      args: { boardId: 140, platform: "CubeOrange" },
    });

    await page.locator('[data-testid="firmware-start-serial"]').click();

    await expect(page.getByText("Flash failed: serial bootloader handshake failed")).toBeVisible();
    await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
      cmd: "firmware_flash_serial",
      args: {
        request: {
          port: "/dev/ttyACM0",
          baud: 115200,
          source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
          options: { full_chip_erase: false },
        },
      },
    });
  });

  test("phone-width nav reaches firmware recovery and returns to install after verified DFU", async ({ page, mockPlatform }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await mockPlatform.reset();
    await mockPlatform.setCommandBehavior("firmware_list_dfu_devices", {
      type: "resolve",
      result: { kind: "available", devices: [] },
    });
    await mockPlatform.setCommandBehavior("firmware_recovery_catalog_targets", {
      type: "reject",
      error: "Could not load official bootloader targets from the recovery catalog.",
    });
    await mockPlatform.setCommandBehavior("firmware_flash_dfu_recovery", { type: "defer" });

    await page.getByRole("button", { name: "Firmware" }).click();
    await expect(page.locator('[data-testid="firmware-panel"]')).toBeVisible();

    await page.locator('[data-testid="firmware-mode-recover"]').click();
    await expect(page.locator('[data-testid="firmware-dfu-recovery-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="firmware-recovery-target-error"]')).toContainText(
      "Could not load official bootloader targets from the recovery catalog.",
    );
    await expect(page.locator('[data-testid="firmware-start-dfu"]')).toBeDisabled();

    await mockPlatform.clearCommandBehavior("firmware_recovery_catalog_targets");
    await mockPlatform.clearCommandBehavior("firmware_list_dfu_devices");

    await page.locator('[data-testid="firmware-recovery-target-retry"]').click();
    await page.getByTitle("Scan for DFU devices").click();

    const recoverySelect = page.locator('[data-testid="firmware-recovery-board-select"]');
    await expect(recoverySelect).toBeEnabled();
    await recoverySelect.selectOption("0");

    await page
      .locator('[data-testid="firmware-dfu-recovery-panel"] input[type="checkbox"]')
      .first()
      .check();

    await expect(page.locator('[data-testid="firmware-start-dfu"]')).toBeEnabled();
    await page.locator('[data-testid="firmware-start-dfu"]').click();

    await expect(page.getByText("DFU bootloader install in progress…")).toBeVisible();
    expect(await mockPlatform.resolveDeferred("firmware_flash_dfu_recovery", { result: "verified" })).toBe(true);

    await expect(page.locator('[data-testid="firmware-serial-panel"]')).toBeVisible();
    await expect(
      page.getByText("Bootloader recovery completed. Continue here with Install / Update to flash normal firmware."),
    ).toBeVisible();
    await expect.poll(() => mockPlatform.getInvocations()).toContainEqual({
      cmd: "firmware_flash_dfu_recovery",
      args: {
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
      },
    });
  });
});
