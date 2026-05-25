<script lang="ts">
import { Box, Compass } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
} from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import { getMotorLayout } from "../../../data/motor-layouts";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  deriveVehicleProfile,
  getVehicleSlug,
  type VehicleProfile,
} from "../../../lib/setup/vehicle-profile";
import {
  getVtolLayoutModel,
  type MotorDiagramModel,
} from "../../../lib/setup/vtol-layout-model";
import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceSection,
} from "../../../lib/stores/setup-workspace";
import SetupSectionShell from "../SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import MotorDiagram from "../shared/MotorDiagram.svelte";
import SetupStagedBadge from "../../ui/StagedBadge.svelte";

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
}: {
  section: SetupWorkspaceSection;
  checkpoint: SetupWorkspaceCheckpointState;
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
let motorPreviewLabel = $derived(
  previewVtolLayout?.status === "unsupported"
    ? "Unsupported VTOL layout"
    : previewVtolLayout?.source === "custom"
      ? "Custom VTOL layout preview"
      : "Motor layout preview",
);

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

function stage(item: ParameterItemModel | null, draftValue: string) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || checkpoint.blocksActions) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}

function unstage(name: string) {
  paramsStore.discardStagedEdit(name);
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

function framePanelTitle(profile: VehicleProfile): string {
  if (profile.frameParamFamily !== "quadplane") {
    return "Frame Configuration";
  }

  switch (profile.subtype) {
    case "tiltrotor":
      return "Tilt-Rotor QuadPlane Frame";
    case "tailsitter":
      return "Tailsitter QuadPlane Frame";
    default:
      return "QuadPlane Frame";
  }
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
  sectionId={section.id}
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

  <div class="space-y-4">
    {#if showQEnableCard}
      <article
        class="rounded-lg border border-border bg-bg-tertiary/50 p-4"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-Q_ENABLE`}
      >
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          <Box size={14} class="text-accent" aria-hidden="true" />
          <span>QuadPlane Configuration</span>
        </div>

        <div class="mt-4">
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="setup-frame-q-enable">VTOL / QuadPlane</label>
            {#if params.stagedEdits.Q_ENABLE}
              <SetupStagedBadge name="Q_ENABLE" onUnstage={unstage} testId={`${setupWorkspaceTestIds.frameStagedPrefix}-Q_ENABLE`} />
            {/if}
          </div>
        <select
          id="setup-frame-q-enable"
          bind:value={qEnableDraft}
          class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`}
          disabled={checkpoint.blocksActions}
          onchange={(event) => stage(qEnableItem, (event.currentTarget as HTMLSelectElement).value)}
        >
          {#each qEnableOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
          <p class="mt-2 text-xs leading-relaxed text-text-muted">
            {qEnableItem?.description ?? "Enable QuadPlane to expose VTOL frame, motor, and tuning parameters on Plane firmware."}
          </p>
        </div>
      </article>
    {/if}

    {#if showFrameCards && frameClassItem && frameTypeItem}
      <article
        class="rounded-lg border border-border bg-bg-tertiary/50 p-4"
      >
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          <Box size={14} class="text-accent" aria-hidden="true" />
          <span>{framePanelTitle(profile)}</span>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameClassItem.name}`}>
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`setup-frame-${frameClassItem.name}`}>{frameClassItem.label}</label>
              {#if params.stagedEdits[frameClassItem.name]}
                <SetupStagedBadge name={frameClassItem.name} onUnstage={unstage} testId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameClassItem.name}`} />
              {/if}
            </div>
            <select
              id={`setup-frame-${frameClassItem.name}`}
              bind:value={frameClassDraft}
              class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
              data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-${frameClassItem.name}`}
              disabled={checkpoint.blocksActions}
              onchange={(event) => stage(frameClassItem, (event.currentTarget as HTMLSelectElement).value)}
            >
              {#each frameClassOptions as option (option.code)}
                <option value={String(option.code)}>{option.label}</option>
              {/each}
            </select>
            <p class="mt-2 text-xs leading-relaxed text-text-muted">
              {frameClassItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the authoritative QuadPlane lift-motor frame family after the VTOL params refresh."
                : "Choose the current frame family reported by ArduPilot metadata.")}
            </p>
          </div>

          <div data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameTypeItem.name}`}>
            <div class="flex flex-wrap items-center gap-2">
              <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`setup-frame-${frameTypeItem.name}`}>{frameTypeItem.label}</label>
              {#if params.stagedEdits[frameTypeItem.name]}
                <SetupStagedBadge name={frameTypeItem.name} onUnstage={unstage} testId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameTypeItem.name}`} />
              {/if}
            </div>
            <select
              id={`setup-frame-${frameTypeItem.name}`}
              bind:value={frameTypeDraft}
              class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
              data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-${frameTypeItem.name}`}
              disabled={checkpoint.blocksActions}
              onchange={(event) => stage(frameTypeItem, (event.currentTarget as HTMLSelectElement).value)}
            >
              {#each frameTypeOptions as option (option.code)}
                <option value={String(option.code)}>{option.label}</option>
              {/each}
            </select>
            <p class="mt-2 text-xs leading-relaxed text-text-muted">
              {frameTypeItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the authoritative QuadPlane layout inside the refreshed VTOL frame family."
                : "Choose the layout inside the current frame family.")}
            </p>
          </div>
        </div>

        <div class="mt-4 flex flex-col items-center gap-2 rounded-md border border-border/50 bg-bg-secondary/40 py-4">
          <MotorDiagram
            model={profile.frameParamFamily === "quadplane" ? previewVtolLayout : null}
            frameClass={profile.frameParamFamily !== "quadplane" ? previewFrameClass : null}
            frameType={profile.frameParamFamily !== "quadplane" ? previewFrameType : null}
            size={180}
          />
          <span class="text-[10px] text-text-muted">{motorPreviewLabel}</span>
        </div>
      </article>
    {/if}

    {#if showOrientationCard && orientationItem}
      <article
        class="rounded-lg border border-border bg-bg-tertiary/50 p-4"
        data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-AHRS_ORIENTATION`}
      >
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text-muted">
          <Compass size={14} class="text-accent" aria-hidden="true" />
          <span>Board Orientation</span>
        </div>

        <div class="mt-4">
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for="setup-frame-ahrs-orientation">Orientation</label>
            {#if params.stagedEdits.AHRS_ORIENTATION}
              <SetupStagedBadge name="AHRS_ORIENTATION" onUnstage={unstage} testId={`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`} />
            {/if}
          </div>
        <select
          id="setup-frame-ahrs-orientation"
          bind:value={orientationDraft}
          class="mt-2 w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
          data-testid={`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`}
          disabled={checkpoint.blocksActions}
          onchange={(event) => stage(orientationItem, (event.currentTarget as HTMLSelectElement).value)}
        >
          {#each orientationOptions as option (option.code)}
            <option value={String(option.code)}>{option.label}</option>
          {/each}
        </select>
          <p class="mt-2 text-xs leading-relaxed text-text-muted">
            Set the physical orientation of the flight controller on your frame. The arrow on the FC should point forward. If mounted differently, select the rotation that matches.
          </p>
        </div>
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
    </div>
  {/if}
  {/snippet}
</SetupSectionShell>
