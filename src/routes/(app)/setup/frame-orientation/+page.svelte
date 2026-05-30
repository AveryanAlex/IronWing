<script lang="ts">
import { Box, Compass } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { getMotorLayout } from "../../../../data/motor-layouts";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { deriveVehicleProfile, getVehicleSlug, type VehicleProfile } from "../../../../lib/setup/vehicle-profile";
import { getVtolLayoutModel, type MotorDiagramModel } from "../../../../lib/setup/vtol-layout-model";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import MotorDiagram from "../../../../features/setup/shared/MotorDiagram.svelte";
import SetupCard from "../../../../features/setup/shared/SetupCard.svelte";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "frame_orientation"));
let checkpoint = $derived(view.checkpoint);

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

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
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
let frameClassOptions = $derived(
  resolveEnumOptions(frameClassItem ? params.metadata?.get(frameClassItem.name)?.values : undefined),
);
let frameTypeOptions = $derived(
  resolveEnumOptions(frameTypeItem ? params.metadata?.get(frameTypeItem.name)?.values : undefined),
);
let orientationOptions = $derived(resolveEnumOptions(params.metadata?.get("AHRS_ORIENTATION")?.values));
let qEnableDraft = $derived(String(params.stagedEdits.Q_ENABLE?.nextValue ?? qEnableItem?.value ?? ""));
let frameClassDraft = $derived(
  String(frameClassItem ? (params.stagedEdits[frameClassItem.name]?.nextValue ?? frameClassItem.value) : ""),
);
let frameTypeDraft = $derived(
  String(frameTypeItem ? (params.stagedEdits[frameTypeItem.name]?.nextValue ?? frameTypeItem.value) : ""),
);
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
  resolveOptionLabel(orientationOptions, resolveDraftNumber(orientationDraft) ?? orientationItem?.value ?? null) ??
    orientationItem?.valueLabel ??
    orientationItem?.valueText ??
    "Orientation unavailable",
);
let retainedFailures = $derived(
  VTOL_RECOVERY_NAMES.map((name) => params.retainedFailures[name]).filter(
    (failure): failure is NonNullable<typeof failure> => failure != null,
  ),
);
let frameBanners = $derived.by(() =>
  buildFrameBanners({
    profile,
    qEnableReady: Boolean(qEnableItem && qEnableOptions.length > 0),
    previewVtolLayout,
  }),
);
let showQEnableCard = $derived(
  profile.isPlane && profile.frameParamFamily !== "quadplane" && qEnableItem && qEnableOptions.length > 0,
);
let showFrameCards = $derived(
  Boolean(frameClassItem && frameTypeItem && frameClassOptions.length > 0 && frameTypeOptions.length > 0),
);
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
        return "VTOL settings incomplete";
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
        return "VTOL is enabled, but Q_FRAME_CLASS and Q_FRAME_TYPE are not available yet. Refresh parameters before motor testing.";
      case "partial-refresh":
        return "Only part of the Q_FRAME family is present. Refresh parameters before changing the QuadPlane layout.";
      case "vtol-ready":
        return "QuadPlane Q_FRAME_* parameters define the VTOL frame layout.";
      case "plain-plane":
      default:
        return "Plane firmware is active and VTOL is not enabled yet. Enable QuadPlane before using VTOL frame settings.";
    }
  }

  if (profile.isCopter) {
    return "FRAME_CLASS and FRAME_TYPE define the active multicopter layout.";
  }

  if (profile.isRover) {
    return "This vehicle family does not use VTOL frame settings here.";
  }

  return "Vehicle type could not be resolved. Connect a vehicle and refresh parameters before changing frame settings.";
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
      return "QuadPlane layout preview appears after refreshed Q_FRAME_* values are available.";
    }

    return (
      layoutModel.message ??
      `The active VTOL layout currently maps ${layoutModel.motors.length} motors for motor testing.`
    );
  }

  if (previewStandardLayout) {
    return `${previewStandardLayout.motors.length} mapped motors in the selected FRAME_CLASS / FRAME_TYPE combination.`;
  }

  if (profile.isPlane) {
    return "A Plane-only scope needs QuadPlane enabled and refreshed before a VTOL motor layout is available.";
  }

  return "The selected frame is not present in the motor-layout map yet.";
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
          text: "Plane firmware can expose a QuadPlane setup path here. Enable Q_ENABLE, apply the staged change, reboot, and refresh parameters before configuring VTOL frame settings.",
        });
        break;
      case "enable-pending":
        banners.push({
          id: "enable-pending",
          tone: "warning",
          text: "QuadPlane enable is staged. Apply the change, reboot the vehicle, and refresh the Q_* parameter family before testing motors.",
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
          text: "Only part of the QuadPlane frame family is available right now. Refresh parameters before changing VTOL frame settings.",
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
        text: "Tilt-rotor QuadPlane detected. Lift-motor frame layout comes from Q_FRAME_CLASS and Q_FRAME_TYPE after the VTOL parameter refresh.",
      });
    }

    if (input.profile.subtype === "tailsitter") {
      banners.push({
        id: "tailsitter",
        tone: "info",
        text: "Tailsitter QuadPlane detected. Use the refreshed Q_FRAME_* values for layout selection and verify motor mapping manually when the preview is advisory.",
      });
    }
  }

  if (input.profile.hasUnsupportedSubtype) {
    banners.push({
      id: "unsupported-subtype",
      tone: "danger",
      text: "Both tilt-rotor and tailsitter flags are enabled. Refresh the full parameter list before using VTOL layout-dependent guidance.",
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
  title="Configure frame, QuadPlane, and board orientation"
  description="Choose the ArduPilot frame family and layout, enable QuadPlane options where supported, and set the physical board orientation. Parameter-backed changes are staged for review before apply."
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
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Layout</p>
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
      <p class="font-semibold text-text-primary">Some frame or orientation changes could not be applied.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each retainedFailures as failure (failure.name)}
          <li>{failure.name} · {failure.message}</li>
        {/each}
      </ul>
    </SetupNotice>
  {/if}

  <SetupNoticeList notices={frameBanners} testIdPrefix={setupWorkspaceTestIds.frameBannerPrefix} />

  <div class="space-y-4">
    {#if showQEnableCard && qEnableItem}
      <SetupSectionCard icon={Box} title="QuadPlane Configuration" compact testId={`${setupWorkspaceTestIds.frameCardPrefix}-Q_ENABLE`}>
        <SetupParamEditGrid>
        <SetupParamEditCard
          item={qEnableItem}
          inputId="setup-frame-q-enable"
          value={qEnableDraft}
          options={qEnableOptions}
          type="enum"
          label="VTOL / QuadPlane"
          description={qEnableItem.description ?? "Enable QuadPlane to expose VTOL frame, motor, and tuning parameters on Plane firmware."}
          inputTestId={`${setupWorkspaceTestIds.frameInputPrefix}-Q_ENABLE`}
          disabled={checkpoint.blocksActions}
          stagedName={params.stagedEdits.Q_ENABLE ? "Q_ENABLE" : undefined}
          stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-Q_ENABLE`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "string" && stage(qEnableItem, value)}
        />
        </SetupParamEditGrid>
      </SetupSectionCard>
    {/if}

    {#if showFrameCards && frameClassItem && frameTypeItem}
      <SetupSectionCard icon={Box} title={framePanelTitle(profile)} compact>
        <SetupFieldStack>
        <SetupParamEditGrid>
            <SetupParamEditCard
              item={frameClassItem}
              inputId={`setup-frame-${frameClassItem.name}`}
              value={frameClassDraft}
              options={frameClassOptions}
              type="enum"
              label={frameClassItem.label}
              description={frameClassItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the QuadPlane lift-motor frame family after the VTOL parameter refresh."
                : "Choose the current frame family reported by ArduPilot.")}
              testId={`${setupWorkspaceTestIds.frameCardPrefix}-${frameClassItem.name}`}
              inputTestId={`${setupWorkspaceTestIds.frameInputPrefix}-${frameClassItem.name}`}
              disabled={checkpoint.blocksActions}
              stagedName={params.stagedEdits[frameClassItem.name] ? frameClassItem.name : undefined}
              stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameClassItem.name}`}
              onUnstage={unstage}
              onValueChange={(value) => typeof value === "string" && stage(frameClassItem, value)}
            />

            <SetupParamEditCard
              item={frameTypeItem}
              inputId={`setup-frame-${frameTypeItem.name}`}
              value={frameTypeDraft}
              options={frameTypeOptions}
              type="enum"
              label={frameTypeItem.label}
              description={frameTypeItem.description ?? (profile.frameParamFamily === "quadplane"
                ? "Choose the QuadPlane layout inside the refreshed VTOL frame family."
                : "Choose the layout inside the current frame family.")}
              testId={`${setupWorkspaceTestIds.frameCardPrefix}-${frameTypeItem.name}`}
              inputTestId={`${setupWorkspaceTestIds.frameInputPrefix}-${frameTypeItem.name}`}
              disabled={checkpoint.blocksActions}
              stagedName={params.stagedEdits[frameTypeItem.name] ? frameTypeItem.name : undefined}
              stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-${frameTypeItem.name}`}
              onUnstage={unstage}
              onValueChange={(value) => typeof value === "string" && stage(frameTypeItem, value)}
            />
        </SetupParamEditGrid>

        <div class="flex flex-col items-center gap-2 rounded-md border border-border/50 bg-bg-secondary/40 py-4">
          <MotorDiagram
            model={profile.frameParamFamily === "quadplane" ? previewVtolLayout : null}
            frameClass={profile.frameParamFamily !== "quadplane" ? previewFrameClass : null}
            frameType={profile.frameParamFamily !== "quadplane" ? previewFrameType : null}
            size={180}
          />
          <span class="text-[10px] text-text-muted">{motorPreviewLabel}</span>
        </div>
        </SetupFieldStack>
      </SetupSectionCard>
    {/if}

    {#if showOrientationCard && orientationItem}
      <SetupSectionCard icon={Compass} title="Board Orientation" compact testId={`${setupWorkspaceTestIds.frameCardPrefix}-AHRS_ORIENTATION`}>
        <SetupParamEditGrid>
        <SetupParamEditCard
          item={orientationItem}
          inputId="setup-frame-ahrs-orientation"
          value={orientationDraft}
          options={orientationOptions}
          type="enum"
          label="Orientation"
          description="Set the physical orientation of the flight controller on your frame. The arrow on the FC should point forward. If mounted differently, select the rotation that matches."
          inputTestId={`${setupWorkspaceTestIds.frameInputPrefix}-AHRS_ORIENTATION`}
          disabled={checkpoint.blocksActions}
          stagedName={params.stagedEdits.AHRS_ORIENTATION ? "AHRS_ORIENTATION" : undefined}
          stagedTestId={`${setupWorkspaceTestIds.frameStagedPrefix}-AHRS_ORIENTATION`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "string" && stage(orientationItem, value)}
        />
        </SetupParamEditGrid>
      </SetupSectionCard>
    {/if}
  </div>
  {/snippet}
</SetupSectionShell>
