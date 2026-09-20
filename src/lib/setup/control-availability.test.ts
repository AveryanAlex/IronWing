import { describe, expect, it } from "vitest";

import {
  combineSetupControlAvailability,
  SETUP_CONTROL_AVAILABLE,
  setupCheckpointAvailability,
  setupControlLocked,
  setupReadOnlyAvailability,
  setupUnsupportedAvailability,
} from "./control-availability";

describe("setup control availability", () => {
  it("keeps available controls available", () => {
    expect(combineSetupControlAvailability(SETUP_CONTROL_AVAILABLE, null)).toEqual({ state: "available" });
  });

  it("prioritizes a checkpoint over parameter-specific lock reasons", () => {
    const availability = combineSetupControlAvailability(
      setupUnsupportedAvailability("Q_TILT_MASK"),
      setupReadOnlyAvailability("Q_TILT_MASK"),
      setupControlLocked("apply_required", "Apply first", "Apply the staged architecture."),
      setupCheckpointAvailability("Reboot and reconnect this vehicle before continuing."),
    );

    expect(availability).toMatchObject({
      state: "locked",
      reason: "checkpoint",
      title: "Setup is locked",
    });
  });

  it("distinguishes unsupported and staged prerequisites", () => {
    const unsupported = setupUnsupportedAvailability("Q_TILT_TYPE");
    const staged = setupControlLocked(
      "apply_required",
      "Apply the staged configuration first",
      "Q_TILT_TYPE is not available yet.",
      { nextAction: "review_staged_changes", nextActionLabel: "Review and apply the staged changes." },
    );

    expect(unsupported).toMatchObject({ state: "locked", reason: "unsupported" });
    expect(staged).toMatchObject({
      state: "locked",
      reason: "apply_required",
      nextAction: "review_staged_changes",
    });
  });
});
