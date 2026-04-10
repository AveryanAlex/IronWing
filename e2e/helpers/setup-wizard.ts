import type { Locator, Page } from "@playwright/test";

import { setupWorkspaceTestIds } from "../../src/components/setup/setup-workspace-test-ids";

/**
 * Opens the beginner setup wizard from the connected overview section.
 *
 * The overview launch button selects the `beginner_wizard` section and the
 * workspace shell's auto-start effect immediately calls `wizardStore.start()`
 * on first entry, so the wizard lands on the frame step without a separate
 * "Start wizard" click.
 */
export async function openSetupWizard(page: Page): Promise<void> {
  await page.getByTestId(setupWorkspaceTestIds.overviewWizardLaunch).click();
  await page.getByTestId(setupWorkspaceTestIds.wizardRoot).waitFor();
  await page.getByTestId(setupWorkspaceTestIds.wizardStepFrame).waitFor();
}

export function wizardStepBodyLocator(page: Page, stepId: string): Locator {
  return page.locator(
    `[data-testid="${setupWorkspaceTestIds.wizardStepBodyPrefix}-${stepId}"]`,
  );
}

export function wizardBannerLocator(
  page: Page,
  kind: "detour" | "checkpoint" | "scope",
): Locator {
  const id =
    kind === "detour"
      ? setupWorkspaceTestIds.wizardPausedDetour
      : kind === "checkpoint"
        ? setupWorkspaceTestIds.wizardPausedCheckpoint
        : setupWorkspaceTestIds.wizardPausedScope;
  return page.getByTestId(id);
}

export async function skipWizardStep(page: Page): Promise<void> {
  await page.getByTestId(setupWorkspaceTestIds.wizardStepSkip).click();
}
