import type { ParamInputParams } from "./param-helpers";
import { getStagedOrCurrent, getParamMeta, formatParamValue } from "./param-helpers";

type ParamDisplayProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  className?: string;
};

export function ParamDisplay({
  paramName,
  params,
  label,
  description,
  className,
}: ParamDisplayProps) {
  const value = getStagedOrCurrent(paramName, params);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;
  const displayValue = value != null ? formatParamValue(value, meta) : "—";

  return (
    <div data-setup-param={paramName} className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-text-muted">
        {resolvedLabel}
      </span>
      <span className="text-xs font-mono text-text-primary">{displayValue}</span>
      {resolvedDescription && (
        <span className="text-[10px] text-text-muted">{resolvedDescription}</span>
      )}
    </div>
  );
}
