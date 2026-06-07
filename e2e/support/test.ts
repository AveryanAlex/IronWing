import { test as base, expect } from "@playwright/test";

import { IronWingApp } from "./app";

type Fixtures = {
  app: IronWingApp;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    await use(new IronWingApp(page));
  },
});

export { expect };
