import type { ParamInputParams } from "./param-helpers";
import { getStagedOrCurrent, getParamMeta, StagedBadge } from "./param-helpers";

type ParamBitmaskInputProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
};

export function ParamBitmaskInput({
  paramName,
  params,
  label,
  description,
  disabled,
  className,
}: ParamBitmaskInputProps) {
  const value = getStagedOrCurrent(paramName, params) ?? 0;
  const isStaged = params.staged.has(paramName);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;
  const bits = meta?.bitmask ?? [];

  const isReadOnly = disabled ?? meta?.readOnly;

  const toggleBit = (bit: number) => {
    params.stage(paramName, value ^ (1 << bit));
  };

  if (bits.length === 0) {
    return (
      <div className={`flex flex-col gap-1 ${className ?? ""}`}>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {resolvedLabel}
        </span>
        <span className="text-xs text-text-muted">
          No bitmask metadata available — raw value: {value}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
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
      <div className="flex flex-col gap-1">
        {bits.map((entry) => {
          const checked = (value & (1 << entry.bit)) !== 0;
          return (
            <label
              key={entry.bit}
              className="flex items-center gap-2 text-xs text-text-primary"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleBit(entry.bit)}
                disabled={isReadOnly}
                className="rounded border-border accent-accent"
              />
              <span>{entry.label}</span>
            </label>
          );
        })}
      </div>
      {resolvedDescription && (
        <span className="text-[10px] text-text-muted">{resolvedDescription}</span>
      )}
    </div>
  );
}
