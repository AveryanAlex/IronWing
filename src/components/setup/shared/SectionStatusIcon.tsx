import { Check, Circle, HelpCircle, X } from "lucide-react";
import type { SectionStatus } from "../../../hooks/use-setup-sections";

export type SectionStatusIconProps = {
  status: SectionStatus;
};

export function SectionStatusIcon({ status }: SectionStatusIconProps) {
  if (status === "complete") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
        <Check size={10} strokeWidth={3} />
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
        <Circle size={8} fill="currentColor" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
        <X size={9} strokeWidth={3} />
      </span>
    );
  }
  if (status === "unknown") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
        <HelpCircle size={9} strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
      <Circle size={8} />
    </span>
  );
}
