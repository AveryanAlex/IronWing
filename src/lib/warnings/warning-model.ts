export type WarningSeverity = "info" | "success" | "warning" | "danger" | "blocking";

export type Warning = {
  id: string;
  severity: WarningSeverity;
  title: string;
  message?: string;
  source?: string;
  actionLabel?: string;
  onAction?: () => void;
  dismissible?: boolean;
  onDismiss?: () => void;
  details?: ReadonlyArray<string>;
  testId?: string;
  actionTestId?: string;
  dismissTestId?: string;
};

const SEVERITY_ORDER: Record<WarningSeverity, number> = {
  blocking: 0,
  danger: 1,
  warning: 2,
  info: 3,
  success: 4,
};

export function sortBySeverity(warnings: ReadonlyArray<Warning>): Warning[] {
  return [...warnings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
