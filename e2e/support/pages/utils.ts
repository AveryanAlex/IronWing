import { expect, type Locator, type Page } from "@playwright/test";

export async function isVisible(locator: Locator, timeout = 500): Promise<boolean> {
  try {
    return await locator.isVisible({ timeout });
  } catch {
    return false;
  }
}

export async function expectLiveMetric(page: Page, testId: string): Promise<void> {
  const metric = page.getByTestId(testId).first();
  await expect(metric).toBeVisible({ timeout: 20_000 });
  await expect(metric).not.toContainText("--", { timeout: 20_000 });
}

export async function fillAndBlur(locator: Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}

export async function expectNumberInputClose(locator: Locator, expected: number, precision = 3): Promise<void> {
  await expect
    .poll(async () => Number(await locator.inputValue()), { timeout: 10_000 })
    .toBeCloseTo(expected, precision);
}
