export type SetupControlLockReason =
  | "checkpoint"
  | "dependency"
  | "apply_required"
  | "reboot_required"
  | "refresh_required"
  | "read_only"
  | "unsupported"
  | "fixed_by_configuration"
  | "temporarily_unavailable";

export type SetupUnlockAction =
  | "review_staged_changes"
  | "open_reboot_checkpoint"
  | "refresh_parameters"
  | "open_prerequisite";

export type SetupControlAvailability =
  | { state: "available" }
  | {
      state: "locked";
      reason: SetupControlLockReason;
      title: string;
      description: string;
      nextActionLabel?: string;
      nextAction?: SetupUnlockAction;
    };

export const SETUP_CONTROL_AVAILABLE: SetupControlAvailability = { state: "available" };

const PRIORITY: Record<SetupControlLockReason, number> = {
  checkpoint: 90,
  reboot_required: 80,
  refresh_required: 70,
  apply_required: 60,
  dependency: 50,
  fixed_by_configuration: 40,
  read_only: 30,
  unsupported: 20,
  temporarily_unavailable: 10,
};

export function setupControlLocked(
  reason: SetupControlLockReason,
  title: string,
  description: string,
  options: { nextActionLabel?: string; nextAction?: SetupUnlockAction } = {},
): SetupControlAvailability {
  return { state: "locked", reason, title, description, ...options };
}

export function setupCheckpointAvailability(detail?: string | null): SetupControlAvailability {
  return setupControlLocked(
    "checkpoint",
    "Setup is locked",
    detail?.trim() || "Finish the active reboot and reconnect checkpoint before editing parameters.",
    { nextAction: "open_reboot_checkpoint", nextActionLabel: "Open the Setup locked control to continue." },
  );
}

export function setupReadOnlyAvailability(parameterName?: string): SetupControlAvailability {
  return setupControlLocked(
    "read_only",
    "Read-only parameter",
    parameterName
      ? `${parameterName} is reported as read-only by the active parameter source.`
      : "The active parameter source does not allow this value to be changed.",
  );
}

export function setupUnsupportedAvailability(parameterName?: string): SetupControlAvailability {
  return setupControlLocked(
    "unsupported",
    "Parameter unavailable",
    parameterName
      ? `The active firmware does not currently expose ${parameterName}.`
      : "The active firmware does not expose this setting.",
  );
}

export function setupTemporarilyUnavailable(
  description = "This control is locked until its setup requirements are met.",
): SetupControlAvailability {
  return setupControlLocked("temporarily_unavailable", "Editing unavailable", description);
}

export function combineSetupControlAvailability(
  ...candidates: Array<SetupControlAvailability | null | undefined | false>
): SetupControlAvailability {
  const locked = candidates.filter(
    (candidate): candidate is Extract<SetupControlAvailability, { state: "locked" }> => candidate !== false && candidate?.state === "locked",
  );
  if (locked.length === 0) return SETUP_CONTROL_AVAILABLE;
  return locked.reduce((current, candidate) => (
    PRIORITY[candidate.reason] > PRIORITY[current.reason] ? candidate : current
  ));
}

export function resolveSetupControlAvailability(input: {
  availability?: SetupControlAvailability | null;
  disabled?: boolean;
  readOnly?: boolean;
  parameterName?: string;
  disabledDescription?: string;
}): SetupControlAvailability {
  return combineSetupControlAvailability(
    input.availability,
    input.disabled ? setupTemporarilyUnavailable(input.disabledDescription) : null,
    input.readOnly ? setupReadOnlyAvailability(input.parameterName) : null,
  );
}
