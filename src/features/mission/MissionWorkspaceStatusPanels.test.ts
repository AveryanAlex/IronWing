// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEmptyMissionPlannerWorkspace,
  type MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../lib/stores/mission-planner-view";
import type { Warning } from "../../lib/warnings/warning-model";
import MissionWorkspaceStatusPanels from "./components/MissionWorkspaceStatusPanels.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

function makeView(overrides: Partial<MissionPlannerView> = {}): MissionPlannerView {
  return {
    importReview: null,
    exportReview: null,
    ...overrides,
  } as MissionPlannerView;
}

function makePlanner(overrides: Partial<MissionPlannerStoreState> = {}): MissionPlannerStoreState {
  return {
    replacePrompt: null,
    ...overrides,
  } as MissionPlannerStoreState;
}

function renderPanels(options: {
  view?: MissionPlannerView;
  planner?: MissionPlannerStoreState;
  warnings?: Warning[];
  issuesOpen?: boolean;
} = {}) {
  const callbacks = {
    onIssuesOpenChange: vi.fn(),
    onSetImportReviewChoice: vi.fn(),
    onConfirmImportReview: vi.fn(),
    onDismissImportReview: vi.fn(),
    onSetExportReviewChoice: vi.fn(),
    onConfirmExportReview: vi.fn(),
    onDismissExportReview: vi.fn(),
    onConfirmPrompt: vi.fn(),
    onDismissPrompt: vi.fn(),
  };

  render(MissionWorkspaceStatusPanels, {
    view: options.view ?? makeView(),
    planner: options.planner ?? makePlanner(),
    sharedWarnings: options.warnings ?? [],
    issuesOpen: options.issuesOpen ?? false,
    ...callbacks,
  });

  return callbacks;
}

afterEach(async () => {
  cleanup();
  // Bits UI releases its body scroll lock on a 24 ms transition timer.
  await new Promise((resolve) => setTimeout(resolve, 30));
});

describe("MissionWorkspaceStatusPanels", () => {
  it("keeps planner warnings in an actionable issues sheet", async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    const warning: Warning = {
      id: "validation-1",
      severity: "warning",
      title: "Validation warning",
      message: "Waypoint 2 is outside the fence.",
      source: "mission",
      actionLabel: "Open mission mode",
      onAction,
      dismissible: true,
      onDismiss,
      testId: "validation-warning",
    };
    const danger: Warning = {
      id: "transfer-error",
      severity: "danger",
      title: "Transfer failed",
      message: "The vehicle rejected the transfer.",
      testId: "transfer-error",
    };
    const callbacks = renderPanels({ warnings: [warning, danger], issuesOpen: true });

    const sheet = screen.getByRole("dialog", { name: "Mission issues · 2" });
    expect(sheet).toBeTruthy();
    expect(screen.getByTestId("validation-warning").textContent).toContain("Waypoint 2 is outside the fence");
    expect(
      screen.getByTestId("transfer-error").compareDocumentPosition(screen.getByTestId("validation-warning"))
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Open mission mode" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(callbacks.onIssuesOpenChange).toHaveBeenCalledWith(false);
  });

  it("presents import choices in a modal review", () => {
    renderPanels({
      view: makeView({
        importReview: {
          source: "plan",
          fileName: "survey.plan",
          warnings: [],
          incomingWorkspace: createEmptyMissionPlannerWorkspace(),
          choices: [
            {
              domain: "mission",
              label: "Mission + Home + Survey",
              currentSummary: "2 mission items",
              incomingSummary: "4 mission items",
              replace: true,
            },
          ],
        },
      }),
    });

    expect(screen.getByRole("dialog", { name: "Review survey.plan before replacing planner domains" })).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.importReview).textContent).toContain("Nothing changes until you apply");
  });
});
