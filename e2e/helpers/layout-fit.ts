import type { Page } from "@playwright/test";

export type LayoutFitViolationKind =
  | "document-overflow-x"
  | "container-overflow-x"
  | "element-overflow-x"
  | "element-outside-container-x"
  | "element-obstructed";

export type LayoutFitViolation = {
  scope: string;
  kind: LayoutFitViolationKind;
  selector: string;
  containerSelector?: string;
  text: string;
  metrics: Record<string, number>;
};

export type LayoutFitOptions = {
  tolerancePx?: number;
  maxViolations?: number;
  ignoredSelectors?: readonly string[];
  allowedHorizontalOverflowSelectors?: readonly string[];
  scannedElementSelectors?: readonly string[];
  fitContainerSelectors?: readonly string[];
};

const DEFAULT_TOLERANCE_PX = 4;
const DEFAULT_MAX_VIOLATIONS = 80;

const defaultIgnoredSelectors = [
  "[hidden]",
  "[aria-hidden='true']",
  "[inert]",
  "[data-state='closed']",
  ".hidden",
  ".sr-only",
  "svg",
  "canvas",
  "path",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "rect",
  "[role='tooltip']",
  "[role='menu']",
  "[class^='maplibregl-']",
  "[class*=' maplibregl-']",
  "[data-testid='mission-map-debug']",
] as const;

const defaultAllowedHorizontalOverflowSelectors = [
  "[data-layout-allow-overflow-x='true']",
  "[data-density='scroll']",
  "[data-testid='overview-map-root']",
  "[data-testid='overview-map-surface']",
  "[data-testid='mission-map']",
  "[data-testid='mission-map-surface']",
  "[data-testid='mission-map-basemap']",
  "[data-testid='mission-map-draw-surface']",
  "[data-testid='logs-raw-messages-table']",
  "[data-testid='logs-charts-panel']",
  ".uplot",
  ".u-wrap",
  ".u-over",
  ".u-under",
] as const;

const defaultScannedElementSelectors = [
  "a",
  "button",
  "dd",
  "dt",
  "h1",
  "h2",
  "h3",
  "h4",
  "input:not([type='range'])",
  "label",
  "li",
  "p",
  "select",
  "span",
  "summary",
  "textarea",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
] as const;

const defaultFitContainerSelectors = [
  "article",
  "aside",
  "dl",
  "fieldset",
  "form",
  "header",
  "nav",
  "section",
  "[data-testid]",
  "[role='group']",
  "[class~='rounded-md'][class~='border']",
  "[class~='rounded-lg'][class~='border']",
  "[class~='rounded-xl'][class~='border']",
  "[class~='rounded-2xl'][class~='border']",
] as const;

export async function waitForLayoutFitScanReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function collectLayoutFitViolations(
  page: Page,
  scope: string,
  options: LayoutFitOptions = {},
): Promise<LayoutFitViolation[]> {
  await waitForLayoutFitScanReady(page);

  return page.evaluate((config) => {
    const {
      scope,
      tolerancePx,
      maxViolations,
      ignoredSelectors,
      allowedHorizontalOverflowSelectors,
      scannedElementSelectors,
      fitContainerSelectors,
    } = config;

    const violations: LayoutFitViolation[] = [];
    const seen = new Set<string>();

    function push(violation: LayoutFitViolation) {
      const key = [
        violation.kind,
        violation.selector,
        violation.containerSelector ?? "",
        JSON.stringify(violation.metrics),
      ].join("|");

      if (seen.has(key) || violations.length >= maxViolations) {
        return;
      }

      seen.add(key);
      violations.push(violation);
    }

    function matchesSelector(element: Element, selector: string): boolean {
      try {
        return element.matches(selector);
      } catch {
        return false;
      }
    }

    function closestSelector(element: Element, selector: string): Element | null {
      try {
        return element.closest(selector);
      } catch {
        return null;
      }
    }

    function matchesAny(element: Element, selectors: readonly string[]): boolean {
      return selectors.some((selector) => matchesSelector(element, selector));
    }

    function closestAny(element: Element, selectors: readonly string[]): Element | null {
      for (const selector of selectors) {
        const match = closestSelector(element, selector);
        if (match) {
          return match;
        }
      }
      return null;
    }

    function isIgnored(element: Element): boolean {
      return Boolean(closestAny(element, ignoredSelectors));
    }

    function isAllowedHorizontalOverflow(element: Element): boolean {
      return Boolean(closestAny(element, allowedHorizontalOverflowSelectors));
    }

    function isVisible(element: Element): boolean {
      if (isIgnored(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0.5 || rect.height <= 0.5) {
        return false;
      }

      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0;
    }

    function textFor(element: Element): string {
      const htmlElement = element as HTMLElement;
      const raw = htmlElement.innerText?.trim()
        || element.getAttribute("aria-label")?.trim()
        || element.getAttribute("title")?.trim()
        || (element as HTMLInputElement).value?.trim()
        || "";

      return raw.replace(/\s+/g, " ").slice(0, 120);
    }

    function isFormControl(element: Element): boolean {
      return ["input", "select", "textarea"].includes(element.localName.toLowerCase());
    }

    function quoteAttribute(value: string): string {
      return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
    }

    function selectorFor(element: Element): string {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `[data-testid="${quoteAttribute(testId)}"]`;
      }

      const id = element.getAttribute("id");
      if (id) {
        return `#${CSS.escape(id)}`;
      }

      const ariaLabel = element.getAttribute("aria-label");
      const tagName = element.localName.toLowerCase();
      if (ariaLabel) {
        return `${tagName}[aria-label="${quoteAttribute(ariaLabel)}"]`;
      }

      const text = textFor(element);
      if (text) {
        return `${tagName} text="${quoteAttribute(text)}"`;
      }

      const path: string[] = [];
      let current: Element | null = element;
      while (current && current !== document.documentElement && path.length < 4) {
        const currentTag = current.localName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          path.unshift(currentTag);
          break;
        }

        const siblings = Array.from(parent.children as HTMLCollectionOf<Element>).filter(
          (candidate) => candidate.localName === currentTag,
        );
        const siblingIndex = siblings.indexOf(current) + 1;
        path.unshift(siblings.length > 1 ? `${currentTag}:nth-of-type(${siblingIndex})` : currentTag);
        current = parent;
      }

      return path.join(" > ") || tagName;
    }

    function findFitContainer(element: Element): Element | null {
      let current = element.parentElement;
      while (current && current !== document.body && current !== document.documentElement) {
        if (
          !isIgnored(current)
          && !isAllowedHorizontalOverflow(current)
          && matchesAny(current, fitContainerSelectors)
          && isVisible(current)
        ) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    }

    const documentScrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body?.scrollWidth ?? 0,
    );
    const documentClientWidth = document.documentElement.clientWidth;
    if (documentScrollWidth > documentClientWidth + tolerancePx) {
      push({
        scope,
        kind: "document-overflow-x",
        selector: "document",
        text: "document",
        metrics: {
          clientWidth: documentClientWidth,
          overflowPx: documentScrollWidth - documentClientWidth,
          scrollWidth: documentScrollWidth,
        },
      });
    }

    const containerSelector = fitContainerSelectors.join(",");
    for (const element of Array.from(document.querySelectorAll(containerSelector))) {
      if (!isVisible(element) || isAllowedHorizontalOverflow(element)) {
        continue;
      }

      const htmlElement = element as HTMLElement;
      const overflowPx = htmlElement.scrollWidth - htmlElement.clientWidth;
      if (!isFormControl(element) && overflowPx > tolerancePx) {
        push({
          scope,
          kind: "container-overflow-x",
          selector: selectorFor(element),
          text: textFor(element),
          metrics: {
            clientWidth: htmlElement.clientWidth,
            overflowPx,
            scrollWidth: htmlElement.scrollWidth,
          },
        });
      }
    }

    const scannedSelector = scannedElementSelectors.join(",");
    for (const element of Array.from(document.querySelectorAll(scannedSelector))) {
      if (!isVisible(element) || isAllowedHorizontalOverflow(element)) {
        continue;
      }

      const text = textFor(element);
      const htmlElement = element as HTMLElement;
      const style = getComputedStyle(element);
      const usesIntentionalEllipsis = style.overflowX !== "visible" && style.textOverflow === "ellipsis";
      const overflowPx = htmlElement.scrollWidth - htmlElement.clientWidth;

      if (text && !isFormControl(element) && !usesIntentionalEllipsis && overflowPx > tolerancePx) {
        push({
          scope,
          kind: "element-overflow-x",
          selector: selectorFor(element),
          text,
          metrics: {
            clientWidth: htmlElement.clientWidth,
            overflowPx,
            scrollWidth: htmlElement.scrollWidth,
          },
        });
      }

      const fitContainer = findFitContainer(element);
      if (!fitContainer) {
        continue;
      }

      const elementRect = element.getBoundingClientRect();
      const containerRect = fitContainer.getBoundingClientRect();
      const leftOverflowPx = Math.max(0, containerRect.left - elementRect.left);
      const rightOverflowPx = Math.max(0, elementRect.right - containerRect.right);
      if (leftOverflowPx <= tolerancePx && rightOverflowPx <= tolerancePx) {
        continue;
      }

      push({
        scope,
        kind: "element-outside-container-x",
        selector: selectorFor(element),
        containerSelector: selectorFor(fitContainer),
        text,
        metrics: {
          containerLeft: Math.round(containerRect.left * 100) / 100,
          containerRight: Math.round(containerRect.right * 100) / 100,
          elementLeft: Math.round(elementRect.left * 100) / 100,
          elementRight: Math.round(elementRect.right * 100) / 100,
          leftOverflowPx: Math.round(leftOverflowPx * 100) / 100,
          rightOverflowPx: Math.round(rightOverflowPx * 100) / 100,
        },
      });
    }

    return violations;
  }, {
    scope,
    tolerancePx: options.tolerancePx ?? DEFAULT_TOLERANCE_PX,
    maxViolations: options.maxViolations ?? DEFAULT_MAX_VIOLATIONS,
    ignoredSelectors: [...defaultIgnoredSelectors, ...(options.ignoredSelectors ?? [])],
    allowedHorizontalOverflowSelectors: [
      ...defaultAllowedHorizontalOverflowSelectors,
      ...(options.allowedHorizontalOverflowSelectors ?? []),
    ],
    scannedElementSelectors: [...defaultScannedElementSelectors, ...(options.scannedElementSelectors ?? [])],
    fitContainerSelectors: [...defaultFitContainerSelectors, ...(options.fitContainerSelectors ?? [])],
  });
}

export function formatLayoutFitViolations(violations: readonly LayoutFitViolation[]): string[] {
  return violations.map((violation) => {
    const container = violation.containerSelector ? ` within ${violation.containerSelector}` : "";
    const metrics = Object.entries(violation.metrics)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ");
    const text = violation.text ? ` text=${JSON.stringify(violation.text)}` : "";

    return `${violation.scope}: ${violation.kind} ${violation.selector}${container}${text} (${metrics})`;
  });
}
