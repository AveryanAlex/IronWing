import { expect, type Locator, type Page } from "@playwright/test";

export type DemoViewportName = "desktop" | "radiomaster" | "phone";

export const demoViewports: Record<DemoViewportName, { width: number; height: number; expectedTier: string }> = {
  desktop: { width: 1440, height: 900, expectedTier: "wide" },
  radiomaster: { width: 800, height: 480, expectedTier: "tablet" },
  phone: { width: 390, height: 844, expectedTier: "phone" },
};

export const constrainedLayoutViewports = ["radiomaster", "phone"] as const satisfies readonly DemoViewportName[];
export const allLayoutViewports = ["desktop", ...constrainedLayoutViewports] as const satisfies readonly DemoViewportName[];

export type LayoutTarget = {
  label: string;
  locator: Locator;
  requireEnabled?: boolean;
  requireUncovered?: boolean;
};

type OverflowSnapshot = {
  bodyScrollWidth: number;
  clientWidth: number;
  documentScrollWidth: number;
};

export async function applyDemoViewport(page: Page, viewport: DemoViewportName): Promise<void> {
  const { width, height } = demoViewports[viewport];
  await page.setViewportSize({ width, height });
}

export async function waitForLayoutSettle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export async function expectNoDocumentHorizontalOverflow(page: Page, label: string): Promise<void> {
  await waitForLayoutSettle(page);

  const snapshot: OverflowSnapshot = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));

  const maxScrollWidth = Math.max(snapshot.bodyScrollWidth, snapshot.documentScrollWidth);
  expect(maxScrollWidth, `${label} should not overflow horizontally`).toBeLessThanOrEqual(snapshot.clientWidth + 4);
}

export async function expectPrimarySurfaceInViewport(page: Page, label: string): Promise<void> {
  await waitForLayoutSettle(page);

  const box = await page.getByTestId("app-shell-main-viewport").boundingBox();
  expect(box, `${label} main viewport should be measurable`).not.toBeNull();
  if (!box) return;

  const viewport = page.viewportSize();
  expect(viewport, `${label} viewport should be available`).not.toBeNull();
  if (!viewport) return;

  expect(box.x, `${label} main viewport should start inside the window`).toBeGreaterThanOrEqual(-4);
  expect(box.x + box.width, `${label} main viewport should end inside the window`).toBeLessThanOrEqual(viewport.width + 4);
}

export async function expectWorkspaceUsable(page: Page, label: string, targets: LayoutTarget[] = []): Promise<void> {
  await expectNoDocumentHorizontalOverflow(page, label);
  await expectPrimarySurfaceInViewport(page, label);
  await expectLayoutTargetsReachable(page, label, targets);
}

export async function expectLayoutTargetsReachable(
  page: Page,
  label: string,
  targets: LayoutTarget[],
): Promise<void> {
  for (const target of targets) {
    await expectLayoutTargetReachable(page, `${label}: ${target.label}`, target);
  }
}

export async function expectLayoutTargetReachable(page: Page, label: string, target: LayoutTarget): Promise<void> {
  await target.locator.scrollIntoViewIfNeeded();
  await waitForLayoutSettle(page);
  await expect(target.locator, `${label} should be visible`).toBeVisible();

  if (target.requireEnabled) {
    await expect(target.locator, `${label} should be enabled`).toBeEnabled();
  }

  const snapshot = await target.locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), Math.max(0, viewport.width - 1));
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), Math.max(0, viewport.height - 1));
    const hit = document.elementFromPoint(x, y);
    return {
      height: rect.height,
      hitIsTargetOrChild: hit === element || (hit != null && element.contains(hit)),
      viewport,
      width: rect.width,
      x,
      y,
    };
  });

  expect(snapshot.width, `${label} should have width`).toBeGreaterThan(0);
  expect(snapshot.height, `${label} should have height`).toBeGreaterThan(0);
  expect(snapshot.x, `${label} center should be inside viewport horizontally`).toBeGreaterThanOrEqual(0);
  expect(snapshot.x, `${label} center should be inside viewport horizontally`).toBeLessThanOrEqual(snapshot.viewport.width);
  expect(snapshot.y, `${label} center should be inside viewport vertically`).toBeGreaterThanOrEqual(0);
  expect(snapshot.y, `${label} center should be inside viewport vertically`).toBeLessThanOrEqual(snapshot.viewport.height);

  if (target.requireEnabled || target.requireUncovered) {
    expect(snapshot.hitIsTargetOrChild, `${label} should not be covered by another element`).toBe(true);
  }
}
