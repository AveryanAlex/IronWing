import { createContext } from "svelte";

import type { SetupSectionId } from "../../../lib/setup-sections";
import type { SetupWorkspaceViewStore } from "../../../lib/stores/setup-workspace";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import type { SetupWizardStore } from "../../../lib/stores/setup-wizard";

export type SetupWorkspaceRouteContext = {
  viewStore: SetupWorkspaceViewStore;
  wizardStore: SetupWizardStore;
  selectSection(sectionId: string): void;
  handleSectionLinkClick(sectionId: string, event: MouseEvent): void;
};

export const [getSetupWorkspaceRouteContext, setSetupWorkspaceRouteContext] = createContext<SetupWorkspaceRouteContext>();

export function setupRouteSection(view: SetupWorkspaceStoreState, sectionId: SetupSectionId): SetupWorkspaceSection {
  const section = view.sections.find((entry) => entry.id === sectionId);
  if (!section) {
    throw new Error(`Setup section ${sectionId} is missing from the setup workspace view.`);
  }

  return section;
}
