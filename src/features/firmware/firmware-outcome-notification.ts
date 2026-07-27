import type { FirmwareOutcome } from "../../firmware";
import { notifyError, notifySuccess, notifyWarning } from "../../lib/notifications";
import { firmwareOutcomeCopy } from "./firmware-outcome-copy";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";

function viewRetainedOutcome() {
  document
    .querySelector(`[data-testid="${firmwareWorkspaceTestIds.outcomePanel}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function notifyFirmwareOutcome(outcome: FirmwareOutcome): void {
  const copy = firmwareOutcomeCopy(outcome);
  const options = {
    id: `firmware-${outcome.path}-outcome`,
    description: copy.summary,
    action: {
      label: "View outcome",
      onClick: viewRetainedOutcome,
    },
  };

  if (copy.tone === "success") {
    notifySuccess(copy.label, options);
    return;
  }

  if (copy.tone === "danger") {
    notifyError(copy.label, options);
    return;
  }

  notifyWarning(copy.label, options);
}
