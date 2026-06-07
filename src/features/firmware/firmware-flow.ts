export type FirmwareFlowStepState = "complete" | "current" | "blocked" | "pending";

export type FirmwareChecklistItemState = "ok" | "warning" | "blocked" | "pending";

export type FirmwareChecklistItem = {
  label: string;
  state: FirmwareChecklistItemState;
  detail?: string;
  actionLabel?: string;
};

export function checklistStateLabel(state: FirmwareChecklistItemState): string {
  switch (state) {
    case "ok":
      return "Ready";
    case "warning":
      return "Review";
    case "blocked":
      return "Blocked";
    case "pending":
      return "Pending";
  }
}

export function checklistMarker(state: FirmwareChecklistItemState): string {
  switch (state) {
    case "ok":
      return "✓";
    case "warning":
      return "!";
    case "blocked":
      return "×";
    case "pending":
      return "…";
  }
}

export function checklistToneClass(state: FirmwareChecklistItemState): string {
  switch (state) {
    case "ok":
      return "border-success/35 bg-success/10 text-success";
    case "warning":
      return "border-warning/35 bg-warning/10 text-warning";
    case "blocked":
      return "border-danger/35 bg-danger/10 text-danger";
    case "pending":
      return "border-border bg-bg-secondary text-text-muted";
  }
}
