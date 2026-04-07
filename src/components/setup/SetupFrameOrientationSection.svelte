<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl, type VehicleSlug } from "../../data/ardupilot-docs";
import { getMotorLayout } from "../../data/motor-layouts";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import type { SetupWorkspaceSection } from "../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

const PARAM_NAMES = ["FRAME_CLASS", "FRAME_TYPE", "AHRS_ORIENTATION"] as const;
type ParamName = (typeof PARAM_NAMES)[number];
type EnumOption = { code: number; label: string };

let {
  section,
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let frameClassItem = $derived(itemIndex.get("FRAME_CLASS") ?? null);
let frameTypeItem = $derived(itemIndex.get("FRAME_TYPE") ?? null);
let orientationItem = $derived(itemIndex.get("AHRS_ORIENTATION") ?? null);
let frameClassOptions = $derived(resolveEnumOptions(params.metadata?.get("FRAME_CLASS")?.values));
let frameTypeOptions = $derived(resolveEnumOptions(params.metadata?.get("FRAME_TYPE")?.values));
let orientationOptions = $derived(resolveEnumOptions(params.metadata?.get("AHRS_ORIENTATION")?.values));
let vehicleSlug = $derived(resolveVehicleSlug(params.vehicleType));
let frameDocsUrl = $derived(resolveDocsUrl("frame_type", vehicleSlug));
let frameClassDraft = $derived(String(params.stagedEdits.FRAME_CLASS?.nextValue ?? frameClassItem?.value ?? ""));
let frameTypeDraft = $derived(String(params.stagedEdits.FRAME_TYPE?.nextValue ?? frameTypeItem?.value ?? ""));
let orientationDraft = $derived(String(params.stagedEdits.AHRS_ORIENTATION?.nextValue ?? orientationItem?.value ?? ""));
let previewFrameClass = $derived(resolveDraftNumber(frameClassDraft) ?? frameClassItem?.value ?? null);
let previewFrameType = $derived(resolveDraftNumber(frameTypeDraft) ?? frameTypeItem?.value ?? null);
let previewOrientation = $derived(resolveDraftNumber(orientationDraft) ?? orientationItem?.value ?? null);
let previewLayout = $derived.by(() => {
  if (previewFrameClass === null || previewFrameType === null) {
    return null;
  }

  return getMotorLayout(previewFrameClass, previewFrameType);
});
let previewOrientationLabel = $derived(
  resolveOptionLabel(orientationOptions, previewOrientation)
    ?? orientationItem?.valueLabel
    ?? orientationItem?.valueText
    ?? "Unknown orientation",
);
let recoveryReasons = $derived.by(() => {
  const reasons: string[] = [];

  if (!frameClassItem || frameClassOptions.length === 0) {
    reasons.push("Frame class metadata is missing, so the guided editor cannot prove the available layouts.");
  }
  if (!frameTypeItem || frameTypeOptions.length === 0) {
    reasons.push("Frame type metadata is missing, so the guided editor would have to guess available motor layouts.");
  }
  if (!orientationItem || orientationOptions.length === 0) {
    reasons.push("Orientation metadata is missing, so the guided editor cannot offer a truthful orientation picker.");
  }

  return reasons;
});

function resolveVehicleSlug(vehicleType: string | null): VehicleSlug | null {
  switch (vehicleType) {
    case "quadrotor":
    case "hexarotor":
    case "octorotor":
    case "tricopter":
    case "helicopter":
    case "coaxial":
      return "copter";
    case "fixed_wing":
    case "vtol":
      return "plane";
    case "ground_rover":
      return "rover";
    default:
      return null;
  }
}

function resolveEnumOptions(values: { code: number; label: string }[] | undefined): EnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveDraftNumber(value: string): number | null {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveOptionLabel(options: EnumOption[], value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return options.find((option) => option.code === value)?.label ?? null;
}

function isQueued(name: ParamName, draftValue: string): boolean {
  const nextValue = resolveDraftNumber(draftValue);
  return nextValue !== null && params.stagedEdits[name]?.nextValue === nextValue;
}

function canStage(item: ParameterItemModel | null, draftValue: string): boolean {
  const nextValue = resolveDraftNumber(draftValue);
  return Boolean(
    item
      && nextValue !== null
      && item.readOnly !== true
      && item.value !== nextValue
      && !isQueued(item.name as ParamName, draftValue),
  );
}

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.frameSection}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{section.title}</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Stage truthful frame edits through the shared tray</h3>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
        Guided setup stays honest here: frame class, frame type, and board orientation queue into the shell-owned review tray, while the raw recovery path remains separate.
      </p>
    </div>

    {#if frameDocsUrl}
      <a
        class="rounded-full border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.frameDocsLink}
        href={frameDocsUrl}
        rel="noreferrer"
        target="_blank"
      >
        ArduPilot frame docs
      </a>
    {/if}
  </div>

  <div
    class="grid gap-3 rounded-2xl border border-border bg-bg-primary/80 p-4 md:grid-cols-3"
    data-testid={setupWorkspaceTestIds.frameSummary}
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Status</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{section.statusText}</p>
      <p class="mt-1 text-sm text-text-secondary">{section.detailText}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Layout preview</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">
        {previewLayout ? `${previewLayout.className} ${previewLayout.typeName}` : "Layout preview unavailable"}
      </p>
      <p class="mt-1 text-sm text-text-secondary">
        {previewLayout ? `${previewLayout.motors.length} mapped motors in the current FRAME_CLASS / FRAME_TYPE combination.` : "The selected layout is not present in the authoritative ArduPilot motor-layout map yet."}
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Orientation</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{previewOrientationLabel}</p>
      <p class="mt-1 text-sm text-text-secondary">
        Vehicle type · {params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? "Unknown"}
      </p>
    </div>
  </div>

  {#if recoveryReasons.length > 0}
    <div
      class="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.frameRecovery}
    >
      <p class="font-semibold text-text-primary">Frame &amp; orientation stays closed until metadata proves the editor.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
      <button
        class="mt-4 rounded-full border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {:else}
    <div class="grid gap-3 xl:grid-cols-3">
      <article
        class="rounded-2xl border border-border bg-bg-primary/80 p-4"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-FRAME_CLASS`}
      >
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">FRAME_CLASS</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{frameClassItem?.label ?? "Frame class"}</h4>
        <p class="mt-2 text-sm text-text-secondary">{frameClassItem?.description ?? "Choose the vehicle frame family reported by ArduPilot metadata."}</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-FRAME_CLASS`}>
          Current · {frameClassItem?.valueLabel ?? frameClassItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.FRAME_CLASS}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-FRAME_CLASS`}>
            Queued · {params.stagedEdits.FRAME_CLASS.nextValueText}
          </p>
        {/if}
        <select
          bind:value={frameClassDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-FRAME_CLASS`}
        >
          {#each frameClassOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-FRAME_CLASS`}
          disabled={!canStage(frameClassItem, frameClassDraft)}
          onclick={() => stage(frameClassItem, frameClassDraft)}
          type="button"
        >
          {isQueued("FRAME_CLASS", frameClassDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article
        class="rounded-2xl border border-border bg-bg-primary/80 p-4"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-FRAME_TYPE`}
      >
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">FRAME_TYPE</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{frameTypeItem?.label ?? "Frame type"}</h4>
        <p class="mt-2 text-sm text-text-secondary">{frameTypeItem?.description ?? "Choose the authoritative layout inside the selected frame class."}</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-FRAME_TYPE`}>
          Current · {frameTypeItem?.valueLabel ?? frameTypeItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.FRAME_TYPE}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-FRAME_TYPE`}>
            Queued · {params.stagedEdits.FRAME_TYPE.nextValueText}
          </p>
        {/if}
        <select
          bind:value={frameTypeDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-FRAME_TYPE`}
        >
          {#each frameTypeOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-FRAME_TYPE`}
          disabled={!canStage(frameTypeItem, frameTypeDraft)}
          onclick={() => stage(frameTypeItem, frameTypeDraft)}
          type="button"
        >
          {isQueued("FRAME_TYPE", frameTypeDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article
        class="rounded-2xl border border-border bg-bg-primary/80 p-4"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-AHRS_ORIENTATION`}
      >
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">AHRS_ORIENTATION</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{orientationItem?.label ?? "Orientation"}</h4>
        <p class="mt-2 text-sm text-text-secondary">{orientationItem?.description ?? "Confirm the board orientation before continuing with calibration."}</p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-AHRS_ORIENTATION`}>
          Current · {orientationItem?.valueLabel ?? orientationItem?.valueText ?? "Unavailable"}
        </p>
        {#if params.stagedEdits.AHRS_ORIENTATION}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`}>
            Queued · {params.stagedEdits.AHRS_ORIENTATION.nextValueText}
          </p>
        {/if}
        <select
          bind:value={orientationDraft}
          class="mt-4 w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`}
        >
          {#each orientationOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-AHRS_ORIENTATION`}
          disabled={!canStage(orientationItem, orientationDraft)}
          onclick={() => stage(orientationItem, orientationDraft)}
          type="button"
        >
          {isQueued("AHRS_ORIENTATION", orientationDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>
    </div>
  {/if}
</section>
