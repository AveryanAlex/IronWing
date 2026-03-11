import { Check, Circle } from "lucide-react";
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
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text-muted">
      <Circle size={8} />
    </span>
  );
}
