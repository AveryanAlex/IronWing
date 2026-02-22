import { useState, useCallback } from "react";
import { RefreshCw, Save, FolderOpen, ChevronRight, ChevronDown, Search, Check, X, RotateCw, Loader2, Upload, Trash2, Lock, Wrench, SlidersHorizontal } from "lucide-react";
import type { useParams, FilterMode } from "../hooks/use-params";
import type { Param, ParamType } from "../params";
import type { ParamMeta, ParamMetadataMap } from "../param-metadata";
import { SetupPanel } from "./setup/SetupPanel";

type ConfigPanelProps = {
  params: ReturnType<typeof useParams>;
  connected: boolean;
};

const INTEGER_TYPES: ParamType[] = ["uint8", "int8", "uint16", "int16", "uint32", "int32"];

function displayValue(param: Param): string {
  if (INTEGER_TYPES.includes(param.param_type)) {
    return String(Math.round(param.value));
  }
  return String(param.value);
}

function formatStagedValue(value: number, paramType?: ParamType): string {
  if (paramType && INTEGER_TYPES.includes(paramType)) {
    return String(Math.round(value));
  }
  return String(value);
}

function EnumEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const currentCode = Number(editValue);
  const hasCurrentInValues = meta.values!.some((v) => v.code === currentCode);

  return (
    <div className="flex items-center gap-1">
      <select
        value={editValue}
        onChange={(e) => onEditChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        autoFocus
        className="w-44 rounded border border-accent-blue bg-bg-input pl-1.5 pr-6 py-0.5 text-xs font-mono text-text-primary"
      >
        {!hasCurrentInValues && (
          <option value={editValue}>{editValue} (custom)</option>
        )}
        {meta.values!.map((v) => (
          <option key={v.code} value={String(v.code)}>
            {v.code}: {v.label}
          </option>
        ))}
      </select>
      <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
        <Check size={12} />
      </button>
      <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
        <X size={12} />
      </button>
    </div>
  );
}

function BitmaskEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const currentVal = Math.round(Number(editValue)) || 0;

  const toggleBit = (bit: number) => {
    const mask = 1 << bit;
    const newVal = currentVal & mask ? currentVal & ~mask : currentVal | mask;
    onEditChange(String(newVal));
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="w-16 text-xs font-mono text-text-muted">= {currentVal}</span>
        <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
          <Check size={12} />
        </button>
        <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
          <X size={12} />
        </button>
      </div>
      <div className="ml-0 flex flex-col gap-0.5 sm:ml-56">
        {meta.bitmask!.map((b) => (
          <label key={b.bit} className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={(currentVal & (1 << b.bit)) !== 0}
              onChange={() => toggleBit(b.bit)}
              className="h-3 w-3 rounded border-border"
            />
            <span className="font-mono text-text-muted">bit {b.bit}</span>
            {b.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function TextEditor({
  meta,
  editValue,
  onEditChange,
  onConfirm,
  onCancel,
}: {
  meta?: ParamMeta;
  editValue: string;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
            if (e.key === "Escape") onCancel();
          }}
          step={meta?.increment}
          autoFocus
          className="w-28 rounded border border-accent-blue bg-bg-input px-1.5 py-0.5 text-xs font-mono text-text-primary"
        />
        <button onClick={onConfirm} className="p-0.5 text-success hover:text-success/80" title="Confirm">
          <Check size={12} />
        </button>
        <button onClick={onCancel} className="p-0.5 text-danger hover:text-danger/80" title="Cancel">
          <X size={12} />
        </button>
      </div>
      {meta?.range && (
        <span className="ml-0.5 text-[10px] text-text-muted">
          Range: {meta.range.min} – {meta.range.max}
          {meta.increment != null && ` (step ${meta.increment})`}
        </span>
      )}
    </div>
  );
}

function ParamRow({
  param,
  meta,
  isEditing,
  editValue,
  stagedValue,
  readOnly,
  onStartEdit,
  onEditChange,
  onConfirm,
  onCancel,
  onUnstage,
}: {
  param: Param;
  meta?: ParamMeta;
  isEditing: boolean;
  editValue: string;
  stagedValue?: number;
  readOnly?: boolean;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onUnstage?: () => void;
}) {
  const isStaged = stagedValue !== undefined;
  const effectiveValue = isStaged ? stagedValue : param.value;
  const valueLabel = meta?.values?.find((v) => v.code === Math.round(effectiveValue))?.label;

  return (
    <div className={`flex flex-col gap-0.5 py-1 px-2 text-xs rounded ${isStaged ? "bg-warning/5" : "hover:bg-bg-tertiary/50"}`}>
      <div className="flex items-center gap-2">
        <span className="w-40 shrink-0 truncate font-mono text-text-primary sm:w-56" title={param.name}>
          {isStaged && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warning" />}
          {param.name}
        </span>
        {isEditing ? (
          meta?.values ? (
            <EnumEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          ) : meta?.bitmask ? (
            <BitmaskEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          ) : (
            <TextEditor meta={meta} editValue={editValue} onEditChange={onEditChange} onConfirm={onConfirm} onCancel={onCancel} />
          )
        ) : readOnly ? (
          <span className="w-28 truncate text-left font-mono text-text-muted">
            {valueLabel ?? displayValue(param)}
          </span>
        ) : (
          <button
            onClick={onStartEdit}
            className={`w-28 truncate text-left font-mono hover:underline ${isStaged ? "text-warning" : "text-accent-blue"}`}
            title={
              isStaged
                ? `Staged: ${formatStagedValue(stagedValue, param.param_type)} (current: ${displayValue(param)})`
                : valueLabel
                  ? `${displayValue(param)} (${valueLabel})`
                  : "Click to edit"
            }
          >
            {isStaged ? formatStagedValue(stagedValue, param.param_type) : (valueLabel ?? displayValue(param))}
          </button>
        )}
        {isStaged && (
          <span className="text-[10px] text-text-muted font-mono">
            was {displayValue(param)}
          </span>
        )}
        {readOnly && (
          <span title="Read-only parameter">
            <Lock size={10} className="shrink-0 text-text-muted" />
          </span>
        )}
        {meta?.units ? (
          <span
            className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted"
            title={meta.unitText ?? param.param_type}
          >
            {meta.units}
          </span>
        ) : (
          <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
            {param.param_type}
          </span>
        )}
        {meta?.rebootRequired && (
          <span title="Reboot required after change">
            <RotateCw size={10} className="shrink-0 text-warning" />
          </span>
        )}
        {isStaged && onUnstage && (
          <button onClick={onUnstage} className="p-0.5 text-text-muted hover:text-danger" title="Unstage">
            <X size={10} />
          </button>
        )}
      </div>
      {meta?.description && (
        <span className="ml-0.5 truncate text-[11px] text-text-muted" title={meta.description}>
          {meta.humanName && meta.humanName !== meta.description
            ? meta.humanName
            : meta.description}
        </span>
      )}
    </div>
  );
}

function ParamGroup({
  prefix,
  params: groupParams,
  metadata,
  editingParam,
  editValue,
  staged,
  onStartEdit,
  onEditChange,
  onConfirm,
  onCancel,
  onUnstage,
}: {
  prefix: string;
  params: Param[];
  metadata: ParamMetadataMap | null;
  editingParam: string | null;
  editValue: string;
  staged: Map<string, number>;
  onStartEdit: (name: string, value: string) => void;
  onEditChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onUnstage: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stagedCount = groupParams.filter((p) => staged.has(p.name)).length;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm font-medium text-text-primary hover:bg-bg-tertiary/50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{prefix}</span>
        <span className="ml-1 text-xs text-text-muted">({groupParams.length})</span>
        {stagedCount > 0 && (
          <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-[10px] font-medium text-warning">
            {stagedCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="ml-2 border-l border-border pl-1">
          {groupParams.map((param) => {
            const meta = metadata?.get(param.name);
            return (
              <ParamRow
                key={param.name}
                param={param}
                meta={meta}
                isEditing={editingParam === param.name}
                editValue={editValue}
                stagedValue={staged.get(param.name)}
                readOnly={meta?.readOnly}
                onStartEdit={() => {
                  const stagedVal = staged.get(param.name);
                  onStartEdit(
                    param.name,
                    stagedVal !== undefined
                      ? formatStagedValue(stagedVal, param.param_type)
                      : displayValue(param),
                  );
                }}
                onEditChange={onEditChange}
                onConfirm={onConfirm}
                onCancel={onCancel}
                onUnstage={() => onUnstage(param.name)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
        active
          ? "bg-accent-blue text-white"
          : "bg-bg-tertiary text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="ml-1">({count})</span>
      )}
    </button>
  );
}

function StagedDiffPanel({
  staged,
  store,
  metadata,
  onUnstage,
}: {
  staged: Map<string, number>;
  store: { params: Record<string, Param> };
  metadata: ParamMetadataMap | null;
  onUnstage: (name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasRebootRequired = Array.from(staged.keys()).some((name) => {
    const meta = metadata?.get(name);
    return meta?.rebootRequired;
  });

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-1.5 rounded border border-warning/30 bg-warning/5 px-2 py-1 text-[11px] text-warning"
      >
        <ChevronRight size={12} />
        {staged.size} staged changes
      </button>
    );
  }

  return (
    <div className="rounded border border-warning/30 bg-warning/5 p-2">
      <button
        onClick={() => setCollapsed(true)}
        className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-warning"
      >
        <ChevronDown size={12} />
        Staged Changes ({staged.size})
      </button>
      {hasRebootRequired && (
        <div className="mb-1.5 flex items-center gap-1 rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">
          <RotateCw size={10} />
          Some changes require a vehicle reboot
        </div>
      )}
      <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {Array.from(staged.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, newValue]) => {
            const current = store.params[name];
            return (
              <div key={name} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="w-40 truncate text-text-primary sm:w-48" title={name}>{name}</span>
                <span className="text-text-muted">{current ? displayValue(current) : "?"}</span>
                <span className="text-text-muted">&rarr;</span>
                <span className="text-warning">
                  {formatStagedValue(newValue, current?.param_type)}
                </span>
                {metadata?.get(name)?.rebootRequired && (
                  <RotateCw size={8} className="text-warning" />
                )}
                <button
                  onClick={() => onUnstage(name)}
                  className="ml-auto p-0.5 text-text-muted hover:text-danger"
                  title="Unstage"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
      </div>
    </div>
  );
}

type ConfigSubTab = "params" | "setup";

export function ConfigPanel({ params, connected }: ConfigPanelProps) {
  const [subTab, setSubTab] = useState<ConfigSubTab>("params");

  const handleStageFromSetup = useCallback(
    (entries: [string, number][]) => {
      for (const [name, value] of entries) {
        params.stage(name, value);
      }
      setSubTab("params");
      params.setFilterMode("modified");
    },
    [params],
  );

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-border pb-1">
        <button
          onClick={() => setSubTab("params")}
          className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
            subTab === "params"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <SlidersHorizontal size={12} />
          Parameters
          {params.staged.size > 0 && (
            <span className="rounded-full bg-warning/20 px-1.5 text-[10px] text-warning">
              {params.staged.size}
            </span>
          )}
        </button>
        <button
          onClick={() => setSubTab("setup")}
          className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
            subTab === "setup"
              ? "bg-bg-tertiary text-text-primary"
              : "text-text-muted hover:text-text-primary"
          }`}
        >
          <Wrench size={12} />
          Setup
        </button>
      </div>

      {subTab === "setup" ? (
        <SetupPanel connected={connected} onStageParams={handleStageFromSetup} />
      ) : (
        <ParamsTabContent params={params} connected={connected} />
      )}
    </div>
  );
}

function ParamsTabContent({ params, connected }: ConfigPanelProps) {
  const downloading = params.progress?.phase === "downloading";
  const writing = params.progress?.phase === "writing";
  const busy = downloading || writing;

  const handleStartEdit = (name: string, value: string) => {
    params.setEditingParam(name);
    params.setEditValue(value);
  };

  // Edit confirm -> always stage (never write directly)
  const handleConfirm = () => {
    if (!params.editingParam) return;
    const val = Number(params.editValue);
    if (!Number.isFinite(val)) return;
    params.stage(params.editingParam, val);
    params.setEditingParam(null);
  };

  const handleCancel = () => {
    params.setEditingParam(null);
  };

  const groupKeys = Object.keys(params.groupedParams).sort();

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={params.download}
          disabled={!connected || busy}
          className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
        >
          <RefreshCw size={12} className={downloading ? "animate-spin" : ""} />
          {downloading ? "Downloading…" : "Refresh"}
        </button>
        <button
          onClick={params.applyStaged}
          disabled={!connected || params.staged.size === 0 || busy}
          className="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
        >
          <Upload size={12} className={writing ? "animate-pulse" : ""} />
          {writing
            ? `Writing ${params.progress?.received ?? 0} / ${params.progress?.expected ?? 0}`
            : `Apply ${params.staged.size} Change${params.staged.size !== 1 ? "s" : ""}`}
        </button>
        {params.staged.size > 0 && (
          <button
            onClick={params.unstageAll}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
          >
            <Trash2 size={12} />
            Discard All
          </button>
        )}
        <button
          onClick={params.saveToFile}
          disabled={!params.store}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
        >
          <Save size={12} />
          Save
        </button>
        <button
          onClick={params.loadFromFile}
          className="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-opacity disabled:opacity-40"
        >
          <FolderOpen size={12} />
          Load
        </button>
        {params.metadataLoading && (
          <span className="flex items-center gap-1 text-[10px] text-text-muted">
            <Loader2 size={10} className="animate-spin" />
            Loading descriptions…
          </span>
        )}
      </div>

      {/* Filter pills + search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <FilterPill label="Standard" active={params.filterMode === "standard"} onClick={() => params.setFilterMode("standard")} />
          <FilterPill label="All" active={params.filterMode === "all"} onClick={() => params.setFilterMode("all")} />
          <FilterPill
            label="Modified"
            active={params.filterMode === "modified"}
            count={params.staged.size}
            onClick={() => params.setFilterMode("modified")}
          />
        </div>
        <div className="flex items-center gap-1.5 sm:ml-auto">
          <Search size={12} className="text-text-muted" />
          <input
            type="text"
            placeholder="Search parameters…"
            value={params.search}
            onChange={(e) => params.setSearch(e.target.value)}
            className="w-full rounded border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted sm:w-48"
          />
        </div>
      </div>

      {/* Progress bar */}
      {busy && params.progress && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-bg-tertiary">
            <div
              className={`h-full rounded-full transition-all ${writing ? "bg-warning" : "bg-accent-blue"}`}
              style={{
                width: params.progress.expected > 0
                  ? `${(params.progress.received / params.progress.expected) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <span className="text-[10px] text-text-muted">
            {writing ? "Writing" : "Downloading"} {params.progress.received} / {params.progress.expected} parameters
          </span>
        </div>
      )}

      {/* Staged diff panel */}
      {params.staged.size > 0 && params.store && (
        <StagedDiffPanel
          staged={params.staged}
          store={params.store}
          metadata={params.metadata}
          onUnstage={params.unstage}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!connected ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Connect to a vehicle to view parameters
          </div>
        ) : !params.store ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            Click Refresh to download parameters from the vehicle
          </div>
        ) : params.filteredParams.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-text-muted">
            {params.search ? "No parameters match your search" : "No parameters available"}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {groupKeys.map((prefix) => (
              <ParamGroup
                key={prefix}
                prefix={prefix}
                params={params.groupedParams[prefix]}
                metadata={params.metadata}
                editingParam={params.editingParam}
                editValue={params.editValue}
                staged={params.staged}
                onStartEdit={handleStartEdit}
                onEditChange={params.setEditValue}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
                onUnstage={params.unstage}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {params.store && (
        <div className="border-t border-border pt-1.5 text-[10px] text-text-muted">
          {params.filteredParams.length} of {params.paramList.length} parameters
          {params.search && ` matching "${params.search}"`}
          {params.staged.size > 0 && ` · ${params.staged.size} staged`}
          {params.metadata && ` · ${params.metadata.size} descriptions loaded`}
        </div>
      )}
    </div>
  );
}
