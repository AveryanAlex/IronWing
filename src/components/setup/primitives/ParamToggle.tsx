import type { ParamInputParams } from "./param-helpers";
import { getStagedOrCurrent, getParamMeta, StagedBadge } from "./param-helpers";

type ParamToggleProps = {
  paramName: string;
  params: ParamInputParams;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
};

export function ParamToggle({
  paramName,
  params,
  label,
  description,
  disabled,
  className,
}: ParamToggleProps) {
  const value = getStagedOrCurrent(paramName, params);
  const isStaged = params.staged.has(paramName);
  const meta = getParamMeta(paramName, params.metadata);

  const resolvedLabel = label ?? meta?.humanName ?? paramName;
  const resolvedDescription = description ?? meta?.description;
  const isOn = value != null && value !== 0;
  const isReadOnly = disabled ?? meta?.readOnly;

  const toggle = () => {
    params.stage(paramName, isOn ? 0 : 1);
  };

  return (
    <div className={`flex items-center justify-between gap-3 ${className ?? ""}`}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-primary">{resolvedLabel}</span>
          {isStaged && (
            <StagedBadge paramName={paramName} unstage={params.unstage} />
          )}
          {meta?.rebootRequired && (
            <span className="rounded bg-danger/10 px-1 py-px text-[9px] font-medium text-danger">
              reboot
            </span>
          )}
        </div>
        {resolvedDescription && (
          <span className="text-[10px] text-text-muted">{resolvedDescription}</span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={toggle}
        disabled={isReadOnly}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50 ${
          isOn ? "bg-accent" : "bg-bg-tertiary"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-text-primary shadow transition-transform ${
            isOn ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
