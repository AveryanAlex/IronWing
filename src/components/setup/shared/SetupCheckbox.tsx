import { Check, Minus } from "lucide-react";
import { cn } from "../../../lib/utils";

type SetupCheckboxProps = {
  /** true = checked, false = unchecked, "mixed" = indeterminate/partial */
  checked: boolean | "mixed";
  /** When provided (and not disabled), renders as interactive <button>. Otherwise renders as visual-only <span>. */
  onChange?: () => void;
  disabled?: boolean;
  /** Box side length in px. Default 14. */
  size?: number;
  className?: string;
};

export function SetupCheckbox({
  checked,
  onChange,
  disabled,
  size = 14,
  className,
}: SetupCheckboxProps) {
  const isActive = checked === true || checked === "mixed";
  const iconSize = Math.round(size * 0.7);

  const boxClasses = cn(
    "flex shrink-0 items-center justify-center rounded transition-colors",
    isActive
      ? "border border-accent bg-accent text-white"
      : "border border-border bg-bg-secondary",
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );

  const content =
    checked === true ? (
      <Check size={iconSize} strokeWidth={3} />
    ) : checked === "mixed" ? (
      <Minus size={iconSize} strokeWidth={3} />
    ) : null;

  const ariaChecked =
    checked === true ? true : checked === "mixed" ? ("mixed" as const) : false;

  if (onChange && !disabled) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={ariaChecked}
        onClick={onChange}
        className={cn(
          boxClasses,
          "hover:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent focus-visible:ring-offset-1",
        )}
        style={{ width: size, height: size }}
      >
        {content}
      </button>
    );
  }

  return (
    <span
      role="checkbox"
      aria-checked={ariaChecked}
      className={boxClasses}
      style={{ width: size, height: size }}
    >
      {content}
    </span>
  );
}
