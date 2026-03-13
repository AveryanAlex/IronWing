import { test, expect } from "@playwright/test";

test("app loads through Remote UI host", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/IronWing/);
});
