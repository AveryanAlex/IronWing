export type DemoViewportName = "desktop" | "radiomaster" | "phone";

export type DemoViewport = {
  width: number;
  height: number;
  expectedTier: string;
};

export const demoViewports: Record<DemoViewportName, DemoViewport> = {
  desktop: { width: 1440, height: 900, expectedTier: "wide" },
  radiomaster: { width: 800, height: 480, expectedTier: "tablet" },
  phone: { width: 390, height: 844, expectedTier: "phone" },
};

export const constrainedLayoutViewports = ["radiomaster", "phone"] as const satisfies readonly DemoViewportName[];
export const allLayoutViewports = [
  "desktop",
  ...constrainedLayoutViewports,
] as const satisfies readonly DemoViewportName[];
