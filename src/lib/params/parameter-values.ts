import type { ParamStore } from "../../params";

export type StagedParameterValues = Readonly<Record<string, { readonly nextValue: number } | undefined>>;
export type DraftParameterValues = Readonly<Record<string, number | undefined>>;
export type ParameterValueSource = {
  paramStore: ParamStore | null;
  stagedEdits?: StagedParameterValues;
  draftOverrides?: DraftParameterValues;
};

export function finiteParameterValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function hasParameter(store: ParamStore | null, name: string): boolean {
  return store?.params[name] !== undefined;
}

export function readAppliedParameter(store: ParamStore | null, name: string): number | null {
  return finiteParameterValue(store?.params[name]?.value);
}

export function readStagedParameter(edits: StagedParameterValues | undefined, name: string): number | null {
  return finiteParameterValue(edits?.[name]?.nextValue);
}

export function resolveParameterValue(applied: number, staged?: { nextValue: number }, draft?: number): number | null {
  return finiteParameterValue(draft) ?? finiteParameterValue(staged?.nextValue) ?? finiteParameterValue(applied);
}

/** Resolve aliases in order; each name uses draft, then staged, then applied values. */
export function readProposedParameter(input: ParameterValueSource, ...names: string[]): number | null {
  for (const name of names) {
    const value = finiteParameterValue(input.draftOverrides?.[name])
      ?? readStagedParameter(input.stagedEdits, name)
      ?? readAppliedParameter(input.paramStore, name);
    if (value !== null) return value;
  }
  return null;
}

export function hasPendingParameterEdit(input: ParameterValueSource, name: string): boolean {
  const staged = readStagedParameter(input.stagedEdits, name);
  return staged !== null && staged !== readAppliedParameter(input.paramStore, name);
}
