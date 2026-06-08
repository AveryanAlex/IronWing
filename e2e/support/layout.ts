import { expect, type Locator, type Page } from "@playwright/test";

import { demoViewports, type DemoViewportName } from "./viewports";

export { allLayoutViewports, constrainedLayoutViewports, demoViewports, type DemoViewportName } from "./viewports";

const LAYOUT_TOLERANCE_PX = 4;
const MAX_REPORTED_OFFENDERS = 20;

export type LayoutAudit = (label: string) => Promise<void>;

export const noopLayoutAudit: LayoutAudit = async () => {};

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

type LayoutOffender = {
  reason: "outside_viewport" | "testid_scroll_overflow";
  tag: string;
  testId: string | null;
  id: string | null;
  className: string;
  text: string;
  rect?: {
    left: number;
    right: number;
    width: number;
  };
  clientWidth?: number;
  scrollWidth?: number;
};

export async function applyDemoViewport(page: Page, viewport: DemoViewportName): Promise<void> {
  const { width, height } = demoViewports[viewport];
  await page.setViewportSize({ width, height });
}

export async function waitForLayoutSettle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const waitForFrames = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

    await waitForFrames();

    const animations = (document as Document & { getAnimations(options?: { subtree?: boolean }): Animation[] })
      .getAnimations({ subtree: true })
      .filter((animation) => {
        if (animation.playState !== "running") {
          return false;
        }

        const timing = animation.effect?.getComputedTiming();
        const endTime = Number(timing?.endTime ?? Number.POSITIVE_INFINITY);
        return Number.isFinite(endTime) && endTime > 0 && endTime <= 500;
      });

    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished)),
        new Promise<void>((resolve) => setTimeout(resolve, 550)),
      ]);
    }

    await waitForFrames();
  });
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
  expect(box.x + box.width, `${label} main viewport should end inside the window`).toBeLessThanOrEqual(
    viewport.width + 4,
  );
}

export async function expectWorkspaceUsable(page: Page, label: string, targets: LayoutTarget[] = []): Promise<void> {
  await expectLayoutClean(page, label);
  await expectLayoutTargetsReachable(page, label, targets);
}

export async function expectLayoutClean(page: Page, label: string): Promise<void> {
  await expectNoDocumentHorizontalOverflow(page, label);
  await expectPrimarySurfaceInViewport(page, label);

  const offenders = await collectVisibleHorizontalLayoutOffenders(page);
  expect(offenders, formatLayoutOffenders(label, offenders)).toEqual([]);
}

async function collectVisibleHorizontalLayoutOffenders(page: Page): Promise<LayoutOffender[]> {
  await waitForLayoutSettle(page);

  return page.evaluate(
    ({ maxOffenders, tolerance }) => {
      const root = document.querySelector('[data-testid="app-shell"]') ?? document.body;
      const offenders: LayoutOffender[] = [];

      function rounded(value: number): number {
        return Math.round(value * 100) / 100;
      }

      function classNameFor(element: Element): string {
        const rawClass = element.getAttribute("class") ?? "";
        return rawClass.replace(/\s+/g, " ").trim().slice(0, 240);
      }

      function textFor(element: Element): string {
        return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
      }

      function describe(element: Element): Omit<LayoutOffender, "reason"> {
        return {
          tag: element.tagName.toLowerCase(),
          testId: element instanceof HTMLElement ? (element.dataset.testid ?? null) : null,
          id: element.id || null,
          className: classNameFor(element),
          text: textFor(element),
        };
      }

      function isVisible(element: Element): boolean {
        if (element.closest('[hidden], [aria-hidden="true"], [inert]')) {
          return false;
        }

        if (element.closest(".maplibregl-marker, .mission-map-marker")) {
          return false;
        }

        const style = getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.opacity === "0"
        ) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0.5 && rect.height > 0.5;
      }

      function hasAllowedHorizontalScroll(element: Element): boolean {
        if (element.closest('[data-layout-scroll-x="allowed"]')) {
          return true;
        }

        for (
          let current: Element | null = element;
          current && current !== root.parentElement;
          current = current.parentElement
        ) {
          const className = ` ${classNameFor(current)} `;
          if (/\soverflow-(x-auto|x-scroll|auto|scroll)\s/.test(className)) {
            return true;
          }
        }

        return false;
      }

      function isNestedSvgElement(element: Element): boolean {
        return element instanceof SVGElement && element.ownerSVGElement != null;
      }

      function addOffender(offender: LayoutOffender): void {
        if (offenders.length < maxOffenders) {
          offenders.push(offender);
        }
      }

      const elements = [root, ...Array.from(root.querySelectorAll("*"))];
      for (const element of elements) {
        if (isNestedSvgElement(element) || !isVisible(element) || hasAllowedHorizontalScroll(element)) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        if (rect.left < -tolerance || rect.right > window.innerWidth + tolerance) {
          addOffender({
            ...describe(element),
            reason: "outside_viewport",
            rect: {
              left: rounded(rect.left),
              right: rounded(rect.right),
              width: rounded(rect.width),
            },
          });
        }

        if (
          element instanceof HTMLElement &&
          element.dataset.testid &&
          element.scrollWidth > element.clientWidth + tolerance
        ) {
          addOffender({
            ...describe(element),
            reason: "testid_scroll_overflow",
            clientWidth: rounded(element.clientWidth),
            scrollWidth: rounded(element.scrollWidth),
          });
        }
      }

      return offenders;
    },
    { maxOffenders: MAX_REPORTED_OFFENDERS, tolerance: LAYOUT_TOLERANCE_PX },
  );
}

function formatLayoutOffenders(label: string, offenders: LayoutOffender[]): string {
  if (offenders.length === 0) {
    return `${label} should not have visible horizontal layout overflow`;
  }

  const lines = offenders.map((offender, index) => {
    const identity = [
      offender.tag,
      offender.testId ? `data-testid=${offender.testId}` : null,
      offender.id ? `id=${offender.id}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    const metrics =
      offender.reason === "outside_viewport"
        ? `rect=${JSON.stringify(offender.rect)}`
        : `clientWidth=${offender.clientWidth} scrollWidth=${offender.scrollWidth}`;
    const text = offender.text ? ` text=${JSON.stringify(offender.text)}` : "";
    const className = offender.className ? ` class=${JSON.stringify(offender.className)}` : "";
    return `${index + 1}. ${offender.reason}: ${identity} ${metrics}${text}${className}`;
  });

  return `${label} should not have visible horizontal layout overflow. Offenders:\n${lines.join("\n")}`;
}

export async function expectLayoutTargetsReachable(page: Page, label: string, targets: LayoutTarget[]): Promise<void> {
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
  expect(snapshot.x, `${label} center should be inside viewport horizontally`).toBeLessThanOrEqual(
    snapshot.viewport.width,
  );
  expect(snapshot.y, `${label} center should be inside viewport vertically`).toBeGreaterThanOrEqual(0);
  expect(snapshot.y, `${label} center should be inside viewport vertically`).toBeLessThanOrEqual(
    snapshot.viewport.height,
  );

  if (target.requireEnabled || target.requireUncovered) {
    expect(snapshot.hitIsTargetOrChild, `${label} should not be covered by another element`).toBe(true);
  }
}
