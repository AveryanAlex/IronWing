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
import SetupSectionShell from "../components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import MotorDiagram from "../shared/MotorDiagram.svelte";
import SetupCard from "../shared/SetupCard.svelte";
import SetupCardHeader from "../shared/SetupCardHeader.svelte";
import SetupNotice from "../shared/SetupNotice.svelte";
import SetupParamSelect from "../shared/SetupParamSelect.svelte";

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
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.frameDocsLink }]}
>
  {#snippet body()}
      <SetupCard
        variant="primary"
        gap="compact"
        class="grid md:grid-cols-3"
        testId={setupWorkspaceTestIds.frameSummary}
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
  </SetupCard>

  {#if retainedFailures.length > 0}
    <SetupNotice tone="danger" testId={setupWorkspaceTestIds.frameFailure}>
      <p class="font-semibold text-text-primary">The shared review tray is still retaining frame or orientation failures.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </SetupNotice>
  {/if}

  {#each frameBanners as banner (banner.id)}
    <SetupNotice tone={banner.tone} testId={`${setupWorkspaceTestIds.frameBannerPrefix}-${banner.id}`}>
      <p>{banner.text}</p>
    </SetupNotice>
  {/each}

  <div class="space-y-4">
    {#if showQEnableCard}
      <SetupCard testId={`${setupWorkspaceTestIds.frameCardPrefix}-Q_ENABLE`}>
        <SetupCardHeader icon={Box} title="QuadPlane Configuration" />

        <SetupParamSelect
          id="setup-frame-q-enable"
          value={qEnableDraft}
          options={qEnableOptions}
          label="VTOL / QuadPlane"
          description={qEnableItem?.description ?? "Enable QuadPlane to expose VTOL frame, motor, and tuning parameters on Plane firmware."}
          testId={`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`}
          disabled={checkpoint.blocksActions}
          stagedName={params.stagedEdits.Q_ENABLE ? "Q_ENABLE" : undefined}
          stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-Q_ENABLE`}
          rebootRequired={qEnableItem?.rebootRequired === true}
          onChange={(value) => stage(qEnableItem, value)}
          onUnstage={unstage}
        />
      </SetupCard>
    {/if}

    {#if showFrameCards && frameClassItem && frameTypeItem}
      <SetupCard>
        <SetupCardHeader icon={Box} title={framePanelTitle(profile)} />

        <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameClassItem.name}`}>
            <SetupParamSelect
              id={`setup-frame-${frameClassItem.name}`}
              value={frameClassDraft}
              options={frameClassOptions}
              label={frameClassItem.label}
              description={frameClassItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the authoritative QuadPlane lift-motor frame family after the VTOL params refresh."
                : "Choose the current frame family reported by ArduPilot metadata.")}
              testId={`${setupWorkspaceTestIds.frameInputPrefix}-${frameClassItem.name}`}
              disabled={checkpoint.blocksActions}
              stagedName={params.stagedEdits[frameClassItem.name] ? frameClassItem.name : undefined}
              stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameClassItem.name}`}
              rebootRequired={frameClassItem.rebootRequired}
              onChange={(value) => stage(frameClassItem, value)}
              onUnstage={unstage}
            />
          </div>

          <div data-testid={`${setupWorkspaceTestIds.frameCardPrefix}-${frameTypeItem.name}`}>
            <SetupParamSelect
              id={`setup-frame-${frameTypeItem.name}`}
              value={frameTypeDraft}
              options={frameTypeOptions}
              label={frameTypeItem.label}
              description={frameTypeItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the authoritative QuadPlane layout inside the refreshed VTOL frame family."
                : "Choose the layout inside the current frame family.")}
              testId={`${setupWorkspaceTestIds.frameInputPrefix}-${frameTypeItem.name}`}
              disabled={checkpoint.blocksActions}
              stagedName={params.stagedEdits[frameTypeItem.name] ? frameTypeItem.name : undefined}
              stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameTypeItem.name}`}
              rebootRequired={frameTypeItem.rebootRequired}
              onChange={(value) => stage(frameTypeItem, value)}
              onUnstage={unstage}
            />
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
      </SetupCard>
    {/if}

    {#if showOrientationCard && orientationItem}
      <SetupCard testId={`${setupWorkspaceTestIds.frameCardPrefix}-AHRS_ORIENTATION`}>
        <SetupCardHeader icon={Compass} title="Board Orientation" />

        <SetupParamSelect
          id="setup-frame-ahrs-orientation"
          value={orientationDraft}
          options={orientationOptions}
          label="Orientation"
          description="Set the physical orientation of the flight controller on your frame. The arrow on the FC should point forward. If mounted differently, select the rotation that matches."
          testId={`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`}
          disabled={checkpoint.blocksActions}
          stagedName={params.stagedEdits.AHRS_ORIENTATION ? "AHRS_ORIENTATION" : undefined}
          stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`}
          rebootRequired={orientationItem.rebootRequired}
          onChange={(value) => stage(orientationItem, value)}
          onUnstage={unstage}
        />
      </SetupCard>
    {/if}
  </div>

  {#if frameRecoveryReasons.length > 0 || orientationRecoveryReason}
    <SetupNotice tone="warning" testId={setupWorkspaceTestIds.frameRecovery}>
      <p class="font-semibold text-text-primary">This section is staying in recovery mode instead of guessing hidden frame or orientation truth.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each frameRecoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
        {#if orientationRecoveryReason}
          <li>{orientationRecoveryReason}</li>
        {/if}
      </ul>
    </SetupNotice>
  {/if}
  {/snippet}
</SetupSectionShell>
