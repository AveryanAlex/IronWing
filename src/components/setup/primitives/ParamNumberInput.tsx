import type { ParamInputParams } from "./param-helpers";
import { getStagedOrCurrent, getParamMeta, StagedBadge } from "./param-helpers";

type ParamNumberInputProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function ParamNumberInput({
  paramName,
  params,
  label,
  description,
  unit,
  min,
  max,
  step,
  placeholder,
  disabled,
  className,
}: ParamNumberInputProps) {
  const value = getStagedOrCurrent(paramName, params);
  const isStaged = params.staged.has(paramName);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;
  const resolvedUnit = unit ?? meta?.unitText ?? meta?.units;
  const resolvedMin = min ?? meta?.range?.min;
  const resolvedMax = max ?? meta?.range?.max;
  const resolvedStep = step ?? meta?.increment;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
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
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value != null ? String(value) : ""}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isNaN(v)) params.stage(paramName, v);
          }}
          min={resolvedMin}
          max={resolvedMax}
          step={resolvedStep}
          placeholder={placeholder}
          disabled={disabled ?? meta?.readOnly}
          className="w-full rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none disabled:opacity-50"
        />
        {resolvedUnit && (
          <span className="shrink-0 text-[10px] text-text-muted">{resolvedUnit}</span>
        )}
      </div>
      {resolvedDescription && (
        <span className="text-[10px] text-text-muted">{resolvedDescription}</span>
      )}
    </div>
  );
}
