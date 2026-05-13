<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import { getMotorLayout } from "../../data/motor-layouts";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import {
  deriveVehicleProfile,
  getVehicleSlug,
  type VehicleProfile,
} from "../../lib/setup/vehicle-profile";
import {
  getVtolLayoutModel,
  type MotorDiagramModel,
} from "../../lib/setup/vtol-layout-model";
import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceSection,
} from "../../lib/stores/setup-workspace";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";
import MotorDiagram from "./shared/MotorDiagram.svelte";

type EnumOption = { code: number; label: string };
type Tone = "info" | "warning" | "danger";
type FrameBanner = { id: string; tone: Tone; text: string };

type StageableParamName =
  | "Q_ENABLE"
  | "FRAME_CLASS"
  | "FRAME_TYPE"
  | "Q_FRAME_CLASS"
  | "Q_FRAME_TYPE"
  | "AHRS_ORIENTATION";

const VTOL_RECOVERY_NAMES = [
  "Q_ENABLE",
  "Q_FRAME_CLASS",
  "Q_FRAME_TYPE",
  "FRAME_CLASS",
  "FRAME_TYPE",
  "AHRS_ORIENTATION",
] as const;

let {
  section,
  checkpoint,
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  checkpoint: SetupWorkspaceCheckpointState;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(
  params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let profile = $derived(
  deriveVehicleProfile(vehicleType, {
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let docsUrl = $derived(resolveDocsUrl("frame_type", getVehicleSlug(vehicleType)));

let qEnableItem = $derived(itemIndex.get("Q_ENABLE") ?? null);
let rawFrameClassItem = $derived(itemIndex.get("FRAME_CLASS") ?? null);
let rawFrameTypeItem = $derived(itemIndex.get("FRAME_TYPE") ?? null);
let orientationItem = $derived(itemIndex.get("AHRS_ORIENTATION") ?? null);
let frameClassItem = $derived.by(() => {
  if (profile.frameClassParam === "Q_FRAME_CLASS") {
    return itemIndex.get("Q_FRAME_CLASS") ?? null;
  }

  if (profile.frameClassParam === "FRAME_CLASS") {
    return itemIndex.get("FRAME_CLASS") ?? null;
  }

  if (!profile.isPlane && rawFrameClassItem && rawFrameTypeItem) {
    return rawFrameClassItem;
  }

  return null;
});
let frameTypeItem = $derived.by(() => {
  if (profile.frameTypeParam === "Q_FRAME_TYPE") {
    return itemIndex.get("Q_FRAME_TYPE") ?? null;
  }

  if (profile.frameTypeParam === "FRAME_TYPE") {
    return itemIndex.get("FRAME_TYPE") ?? null;
  }

  if (!profile.isPlane && rawFrameClassItem && rawFrameTypeItem) {
    return rawFrameTypeItem;
  }

  return null;
});
let qEnableOptions = $derived(resolveEnumOptions(params.metadata?.get("Q_ENABLE")?.values));
let frameClassOptions = $derived(resolveEnumOptions(frameClassItem ? params.metadata?.get(frameClassItem.name)?.values : undefined));
let frameTypeOptions = $derived(resolveEnumOptions(frameTypeItem ? params.metadata?.get(frameTypeItem.name)?.values : undefined));
let orientationOptions = $derived(resolveEnumOptions(params.metadata?.get("AHRS_ORIENTATION")?.values));
let qEnableDraft = $derived(String(params.stagedEdits.Q_ENABLE?.nextValue ?? qEnableItem?.value ?? ""));
let frameClassDraft = $derived(String(frameClassItem ? params.stagedEdits[frameClassItem.name]?.nextValue ?? frameClassItem.value : ""));
let frameTypeDraft = $derived(String(frameTypeItem ? params.stagedEdits[frameTypeItem.name]?.nextValue ?? frameTypeItem.value : ""));
let orientationDraft = $derived(String(params.stagedEdits.AHRS_ORIENTATION?.nextValue ?? orientationItem?.value ?? ""));
let previewFrameClass = $derived(resolveDraftNumber(frameClassDraft) ?? frameClassItem?.value ?? null);
let previewFrameType = $derived(resolveDraftNumber(frameTypeDraft) ?? frameTypeItem?.value ?? null);
let previewStandardLayout = $derived.by(() => {
  if (profile.frameParamFamily === "quadplane") {
    return null;
  }

  if (previewFrameClass === null || previewFrameType === null) {
    return null;
  }

  return getMotorLayout(previewFrameClass, previewFrameType);
});
let previewVtolLayout = $derived.by(() => {
  if (profile.frameParamFamily !== "quadplane" || previewFrameClass === null || previewFrameType === null) {
    return null;
  }

  return getVtolLayoutModel({
    ...profile,
    frameClassValue: previewFrameClass,
    frameTypeValue: previewFrameType,
  });
});
let previewOrientationLabel = $derived(
  resolveOptionLabel(orientationOptions, resolveDraftNumber(orientationDraft) ?? orientationItem?.value ?? null)
    ?? orientationItem?.valueLabel
    ?? orientationItem?.valueText
    ?? "Orientation unavailable",
);
let frameRecoveryReasons = $derived.by(() => {
  const reasons: string[] = [];

  if (profile.isPlane) {
    if (profile.frameParamFamily === "quadplane") {
      if (!frameClassItem || frameClassOptions.length === 0) {
        reasons.push("QuadPlane frame class metadata is missing, so the editor cannot prove the available lift-motor families.");
      }
      if (!frameTypeItem || frameTypeOptions.length === 0) {
        reasons.push("QuadPlane frame type metadata is missing, so the editor cannot prove the available VTOL layouts.");
      }
    } else if (!qEnableItem || qEnableOptions.length === 0) {
      reasons.push("QuadPlane enable metadata is missing, so the section cannot prove VTOL ownership or offer a safe enable path.");
    }

    return reasons;
  }

  if (!frameClassItem || frameClassOptions.length === 0) {
    reasons.push("Frame class metadata is missing, so the guided editor cannot prove the available layouts.");
  }
  if (!frameTypeItem || frameTypeOptions.length === 0) {
    reasons.push("Frame type metadata is missing, so the guided editor would have to guess the available frame layouts.");
  }

  return reasons;
});
let orientationRecoveryReason = $derived.by(() => {
  if (!orientationItem || orientationOptions.length === 0) {
    return "Orientation metadata is missing, so the section cannot offer a truthful board-orientation picker.";
  }

  return null;
});
let retainedFailures = $derived(
  VTOL_RECOVERY_NAMES.map((name) => params.retainedFailures[name])
    .filter((failure): failure is NonNullable<typeof failure> => failure != null),
);
let frameBanners = $derived.by(() => buildFrameBanners({
  profile,
  qEnableReady: Boolean(qEnableItem && qEnableOptions.length > 0),
  previewVtolLayout,
}));
let showQEnableCard = $derived(profile.isPlane && profile.frameParamFamily !== "quadplane" && qEnableItem && qEnableOptions.length > 0);
let showFrameCards = $derived(Boolean(frameClassItem && frameTypeItem && frameClassOptions.length > 0 && frameTypeOptions.length > 0));
let showOrientationCard = $derived(Boolean(orientationItem && orientationOptions.length > 0));

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

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function isQueued(name: string, draftValue: string): boolean {
  const nextValue = resolveDraftNumber(draftValue);
  return nextValue !== null && params.stagedEdits[name]?.nextValue === nextValue;
}

function canStage(item: ParameterItemModel | null, draftValue: string): boolean {
  if (checkpoint.blocksActions) {
    return false;
  }

  const nextValue = resolveDraftNumber(draftValue);
  return Boolean(
    item
      && nextValue !== null
      && item.readOnly !== true
      && item.value !== nextValue
      && params.stagedEdits[item.name]?.nextValue !== nextValue,
  );
}

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || checkpoint.blocksActions) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}

function bannerClass(tone: Tone): string {
  switch (tone) {
    case "warning":
      return "border-warning/40 bg-warning/10 text-warning";
    case "danger":
      return "border-danger/40 bg-danger/10 text-danger";
    case "info":
    default:
      return "border-border bg-bg-primary/80 text-text-secondary";
  }
}

function frameStateLabel(profile: VehicleProfile): string {
  if (profile.isPlane) {
    switch (profile.planeVtolState) {
      case "enable-pending":
        return "VTOL enable pending";
      case "awaiting-refresh":
        return "Awaiting VTOL refresh";
      case "partial-refresh":
        return "Partial VTOL refresh";
      case "vtol-ready":
        switch (profile.subtype) {
          case "tiltrotor":
            return "Tilt-rotor QuadPlane";
          case "tailsitter":
            return "Tailsitter QuadPlane";
          default:
            return "QuadPlane ready";
        }
      case "plain-plane":
      default:
        return "Plain Plane";
    }
  }

  if (profile.isCopter) {
    return "Multicopter frame";
  }

  if (profile.isRover) {
    return "Rover / boat";
  }

  return "Unresolved vehicle profile";
}

function frameStateDetail(profile: VehicleProfile): string {
  if (profile.isPlane) {
    switch (profile.planeVtolState) {
      case "enable-pending":
        return "Q_ENABLE is staged, but the vehicle has not rebooted and refreshed the VTOL parameter family yet.";
      case "awaiting-refresh":
        return "VTOL is enabled, but Q_FRAME_CLASS and Q_FRAME_TYPE have not returned yet. Keep motor testing blocked until refresh completes.";
      case "partial-refresh":
        return "Only part of the Q_FRAME family is present, so the section stays fail-closed instead of guessing the QuadPlane layout.";
      case "vtol-ready":
        return "QuadPlane Q_FRAME_* parameters own frame truth for this scope, and staged edits still flow through the shared review tray.";
      case "plain-plane":
      default:
        return "Plane firmware is active and VTOL is not enabled yet. Use the QuadPlane enable path before expecting motor-layout truth here.";
    }
  }

  if (profile.isCopter) {
    return "FRAME_CLASS and FRAME_TYPE remain the authoritative layout controls for this scope.";
  }

  if (profile.isRover) {
    return "This vehicle family does not expose VTOL frame ownership here, so the section keeps only safe summary/recovery guidance.";
  }

  return "Vehicle type could not be resolved, so the section stays explicit instead of inventing hidden frame ownership.";
}

function layoutStateLabel(profile: VehicleProfile, layoutModel: MotorDiagramModel | null): string {
  if (profile.frameParamFamily === "quadplane") {
    if (!layoutModel) {
      return "Blocked until VTOL refresh";
    }

    if (layoutModel.status === "supported") {
      return `Supported · ${layoutModel.className} ${layoutModel.typeName}`;
    }

    if (layoutModel.status === "preview-only") {
      return `Preview only · ${layoutModel.typeName}`;
    }

    return `Unsupported · ${layoutModel.typeName}`;
  }

  if (previewStandardLayout) {
    return `${previewStandardLayout.className} ${previewStandardLayout.typeName}`;
  }

  if (profile.isPlane) {
    return "Preview blocked";
  }

  return "Preview unavailable";
}

function layoutStateDetail(profile: VehicleProfile, layoutModel: MotorDiagramModel | null): string {
  if (profile.frameParamFamily === "quadplane") {
    if (!layoutModel) {
      return "QuadPlane layout preview stays blocked until the refreshed Q_FRAME_* values are present and coherent.";
    }

    return layoutModel.message
      ?? `The active VTOL layout currently exposes ${layoutModel.motors.length} mapped motors for downstream testing surfaces.`;
  }

  if (previewStandardLayout) {
    return `${previewStandardLayout.motors.length} mapped motors in the authoritative FRAME_CLASS / FRAME_TYPE combination.`;
  }

  if (profile.isPlane) {
    return "A Plane-only scope cannot claim motor-layout truth until VTOL ownership is enabled and refreshed.";
  }

  return "The selected frame is not present in the authoritative motor-layout map yet.";
}

function buildFrameBanners(input: {
  profile: VehicleProfile;
  qEnableReady: boolean;
  previewVtolLayout: MotorDiagramModel | null;
}): FrameBanner[] {
  const banners: FrameBanner[] = [];

  if (input.profile.isPlane && input.qEnableReady) {
    switch (input.profile.planeVtolState) {
      case "plain-plane":
        banners.push({
          id: "plain-plane",
          tone: "info",
          text: "Plane firmware can expose a QuadPlane setup path here. Enable Q_ENABLE, apply the staged change through the shared review tray, reboot, and refresh parameters before expecting VTOL frame or motor truth.",
        });
        break;
      case "enable-pending":
        banners.push({
          id: "enable-pending",
          tone: "warning",
          text: "QuadPlane enable is staged. Apply the change, reboot the vehicle, and wait for the refreshed Q_* parameter family before testing motors or trusting layout ownership.",
        });
        break;
      case "awaiting-refresh":
        banners.push({
          id: "awaiting-refresh",
          tone: "warning",
          text: "QuadPlane is enabled, but the VTOL frame parameters have not arrived yet. Keep actuator testing blocked until Q_FRAME_CLASS and Q_FRAME_TYPE refresh for the same scope.",
        });
        break;
      case "partial-refresh":
        banners.push({
          id: "partial-refresh",
          tone: "warning",
          text: "Only part of the QuadPlane frame family is available right now. Refresh parameters before changing VTOL frame settings so the section does not guess the wrong layout.",
        });
        break;
      default:
        break;
    }
  }

  if (input.profile.frameParamFamily === "quadplane") {
    if (input.profile.subtype === "tiltrotor") {
      banners.push({
        id: "tiltrotor",
        tone: "info",
        text: "Tilt-rotor QuadPlane detected. Lift-motor frame truth still comes from Q_FRAME_CLASS and Q_FRAME_TYPE after the VTOL params refresh.",
      });
    }

    if (input.profile.subtype === "tailsitter") {
      banners.push({
        id: "tailsitter",
        tone: "info",
        text: "Tailsitter QuadPlane detected. Keep using the refreshed Q_FRAME_* values for layout truth, and verify motor ownership manually where the preview stays advisory.",
      });
    }
  }

  if (input.profile.hasUnsupportedSubtype) {
    banners.push({
      id: "unsupported-subtype",
      tone: "danger",
      text: "Both tilt-rotor and tailsitter flags are enabled. Keep using the shared review tray and a full parameter refresh before trusting any VTOL layout-dependent guidance.",
    });
  }

  if (input.previewVtolLayout?.message) {
    banners.push({
      id: `layout-${input.previewVtolLayout.status}`,
      tone: input.previewVtolLayout.status === "unsupported" ? "warning" : "info",
      text: input.previewVtolLayout.message,
    });
  }

  return banners;
}
</script>

<SetupSectionShell
  eyebrow={section.title}
  title="Plane vs QuadPlane truth stays explicit here"
  description="Frame, VTOL enable, and board orientation stay separate from apply ownership: every parameter-backed change stages into the shared review tray, while stale or partial Q-frame truth fails closed instead of bluffing actuator safety."
  testId={setupWorkspaceTestIds.frameSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.frameDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        ArduPilot frame docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.frameSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Vehicle state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameVehicleState}>
        {frameStateLabel(profile)}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{frameStateDetail(profile)}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Layout truth</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameLayoutState}>
        {layoutStateLabel(profile, previewVtolLayout)}
      </p>
      <p class="mt-1 text-sm text-text-secondary">{layoutStateDetail(profile, previewVtolLayout)}</p>

      <div class="mt-4 flex justify-center">
        <MotorDiagram
          model={profile.frameParamFamily === "quadplane" ? previewVtolLayout : null}
          frameClass={profile.frameParamFamily !== "quadplane" ? previewFrameClass : null}
          frameType={profile.frameParamFamily !== "quadplane" ? previewFrameType : null}
          size={160}
        />
      </div>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Orientation</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameOrientationState}>
        {previewOrientationLabel}
      </p>
      <p class="mt-1 text-sm text-text-secondary">Vehicle type · {vehicleType ?? "Unknown"}</p>
    </div>
  </div>

  {#if retainedFailures.length > 0}
    <div
      class="rounded-lg border border-danger/40 bg-danger/10 px-4 py-4 text-sm leading-6 text-danger"
      data-testid={setupWorkspaceTestIds.frameFailure}
    >
      <p class="font-semibold text-text-primary">The shared review tray is still retaining frame or orientation failures.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#each frameBanners as banner (banner.id)}
    <div
      class={`rounded-lg border px-4 py-4 text-sm leading-6 ${bannerClass(banner.tone)}`}
      data-testid={`${setupWorkspaceTestIds.frameBannerPrefix}-${banner.id}`}
    >
      {banner.text}
    </div>
  {/each}

  <div class="grid gap-3 xl:grid-cols-3">
    {#if showQEnableCard}
      <article
        class="rounded-lg border border-border bg-bg-primary/80 p-3"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-Q_ENABLE`}
      >
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Q_ENABLE</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{qEnableItem?.label ?? "QuadPlane enable"}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {qEnableItem?.description ?? "Enable QuadPlane on Plane firmware before expecting VTOL frame, motor, or actuator truth."}
        </p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-Q_ENABLE`}>
          Current · {currentValueText(qEnableItem)}
        </p>
        {#if params.stagedEdits.Q_ENABLE}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-Q_ENABLE`}>
            Queued · {params.stagedEdits.Q_ENABLE.nextValueText}
          </p>
        {/if}
        <select
          bind:value={qEnableDraft}
          class="mt-4 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`}
          disabled={checkpoint.blocksActions}
        >
          {#each qEnableOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-Q_ENABLE`}
          disabled={!canStage(qEnableItem, qEnableDraft)}
          onclick={() => stage(qEnableItem, qEnableDraft)}
          type="button"
        >
          {isQueued("Q_ENABLE", qEnableDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>
    {/if}

    {#if showFrameCards && frameClassItem && frameTypeItem}
      <article
        class="rounded-lg border border-border bg-bg-primary/80 p-3"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameClassItem.name}`}
      >
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{frameClassItem.name}</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{frameClassItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {frameClassItem.description ?? (profile.frameParamFamily === "quadplane"
            ? "Choose the authoritative QuadPlane lift-motor frame family after the VTOL params refresh."
            : "Choose the current frame family reported by ArduPilot metadata.")}
        </p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-${frameClassItem.name}`}>
          Current · {currentValueText(frameClassItem)}
        </p>
        {#if params.stagedEdits[frameClassItem.name]}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameClassItem.name}`}>
            Queued · {params.stagedEdits[frameClassItem.name]?.nextValueText}
          </p>
        {/if}
        <select
          bind:value={frameClassDraft}
          class="mt-4 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-${frameClassItem.name}`}
          disabled={checkpoint.blocksActions}
        >
          {#each frameClassOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-${frameClassItem.name}`}
          disabled={!canStage(frameClassItem, frameClassDraft)}
          onclick={() => stage(frameClassItem, frameClassDraft)}
          type="button"
        >
          {isQueued(frameClassItem.name, frameClassDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>

      <article
        class="rounded-lg border border-border bg-bg-primary/80 p-3"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameTypeItem.name}`}
      >
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{frameTypeItem.name}</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{frameTypeItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {frameTypeItem.description ?? (profile.frameParamFamily === "quadplane"
            ? "Choose the authoritative QuadPlane layout inside the refreshed VTOL frame family."
            : "Choose the layout inside the current frame family.")}
        </p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-${frameTypeItem.name}`}>
          Current · {currentValueText(frameTypeItem)}
        </p>
        {#if params.stagedEdits[frameTypeItem.name]}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameTypeItem.name}`}>
            Queued · {params.stagedEdits[frameTypeItem.name]?.nextValueText}
          </p>
        {/if}
        <select
          bind:value={frameTypeDraft}
          class="mt-4 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-${frameTypeItem.name}`}
          disabled={checkpoint.blocksActions}
        >
          {#each frameTypeOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-${frameTypeItem.name}`}
          disabled={!canStage(frameTypeItem, frameTypeDraft)}
          onclick={() => stage(frameTypeItem, frameTypeDraft)}
          type="button"
        >
          {isQueued(frameTypeItem.name, frameTypeDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>
    {/if}

    {#if showOrientationCard && orientationItem}
      <article
        class="rounded-lg border border-border bg-bg-primary/80 p-3"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-AHRS_ORIENTATION`}
      >
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">AHRS_ORIENTATION</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">{orientationItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {orientationItem.description ?? "Confirm the board orientation before continuing with calibration or actuator work."}
        </p>
        <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.frameCurrentPrefix}-AHRS_ORIENTATION`}>
          Current · {currentValueText(orientationItem)}
        </p>
        {#if params.stagedEdits.AHRS_ORIENTATION}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`}>
            Queued · {params.stagedEdits.AHRS_ORIENTATION.nextValueText}
          </p>
        {/if}
        <select
          bind:value={orientationDraft}
          class="mt-4 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`}
          disabled={checkpoint.blocksActions}
        >
          {#each orientationOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
        <button
          class="mt-3 w-full rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`${setupWorkspaceTestIds.frameStageButtonPrefix}-AHRS_ORIENTATION`}
          disabled={!canStage(orientationItem, orientationDraft)}
          onclick={() => stage(orientationItem, orientationDraft)}
          type="button"
        >
          {isQueued("AHRS_ORIENTATION", orientationDraft) ? "Queued in review tray" : "Stage in review tray"}
        </button>
      </article>
    {/if}
  </div>

  {#if frameRecoveryReasons.length > 0 || orientationRecoveryReason}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.frameRecovery}
    >
      <p class="font-semibold text-text-primary">This section is staying in recovery mode instead of guessing hidden frame or orientation truth.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each frameRecoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
        {#if orientationRecoveryReason}
          <li>{orientationRecoveryReason}</li>
        {/if}
      </ul>
      <button
        class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>
