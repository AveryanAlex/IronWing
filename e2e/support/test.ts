import { test as base, expect } from "@playwright/test";

import { IronWingApp } from "./app";

type Fixtures = {
  app: IronWingApp;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use, testInfo) => {
    const expectedTier =
      typeof testInfo.project.metadata.expectedTier === "string" ? testInfo.project.metadata.expectedTier : undefined;
    await use(new IronWingApp(page, { expectedTier }));
  },
});

export { expect };
