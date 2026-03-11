import type { ParamInputParams } from "./param-helpers";
import { getStagedOrCurrent, getParamMeta, StagedBadge } from "./param-helpers";

type ParamSelectProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  options?: { value: number; label: string }[];
  disabled?: boolean;
  className?: string;
  /**
   * Compact mode for use inside table cells.
   * Suppresses the label row and description, rendering just the select
   * with inline staged/reboot indicators beside it. This keeps all table
   * rows at uniform height regardless of metadata badges.
   */
  compact?: boolean;
};

export function ParamSelect({
  paramName,
  params,
  label,
  description,
  options,
  disabled,
  className,
  compact,
}: ParamSelectProps) {
  const value = getStagedOrCurrent(paramName, params);
  const isStaged = params.staged.has(paramName);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;
  const resolvedOptions =
    options ?? meta?.values?.map((v) => ({ value: v.code, label: v.label })) ?? [];

  const selectEl = (
    <select
      value={value != null ? String(value) : ""}
      onChange={(e) => params.stage(paramName, Number(e.target.value))}
      disabled={disabled ?? meta?.readOnly}
      className={`w-full rounded border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none disabled:opacity-50 ${
        isStaged
          ? "border-warning/60"
          : "border-border"
      }`}
    >
      {value != null && !resolvedOptions.some((o) => o.value === value) && (
        <option value={String(value)}>{value} (custom)</option>
      )}
      {value == null && <option value="">--</option>}
      {resolvedOptions.map((opt) => (
        <option key={opt.value} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  if (compact) {
    return (
      <div data-setup-param={paramName} className={`flex items-center gap-1.5 ${className ?? ""}`}>
        <div className="flex-1 min-w-0">{selectEl}</div>
        {isStaged && (
          <StagedBadge paramName={paramName} unstage={params.unstage} />
        )}
      </div>
    );
  }

  return (
    <div data-setup-param={paramName} className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {resolvedLabel}
        </span>
        {isStaged && (
          <StagedBadge paramName={paramName} unstage={params.unstage} />
        )}
        {meta?.rebootRequired && (
          <span className="rounded bg-danger/10 px-1 py-px text-[9px] font-medium text-danger">
            reboot
          </span>
        )}
      </div>
      {selectEl}
      {resolvedDescription && (
        <span className="text-[10px] text-text-muted">{resolvedDescription}</span>
      )}
    </div>
  );
}
