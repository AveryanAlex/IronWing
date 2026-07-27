<script lang="ts">
import { Box, Compass, PlaneTakeoff } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { getMotorLayout } from "../../../../data/motor-layouts";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import MotorDiagram from "../../../../features/setup/shared/MotorDiagram.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import { Eyebrow, HelperText, InternalLink } from "../../../../components/ui";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { setupSectionPath } from "../../../../lib/setup-sections";
import { deriveVehicleProfile, getVehicleSlug } from "../../../../lib/setup/vehicle-profile";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "frame_orientation"));

const FRAME_RECOVERY_NAMES = ["FRAME_CLASS", "FRAME_TYPE", "AHRS_ORIENTATION"] as const;
const standardFrameParams = [{ id: "FRAME_CLASS" }, { id: "FRAME_TYPE" }] satisfies readonly SetupParamRef[];
const orientationParams = [{ id: "AHRS_ORIENTATION" }] satisfies readonly SetupParamRef[];

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
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let docsUrl = $derived(
  profile.isPlane
    ? resolveDocsUrl("mandatory_hardware_config", "plane")
    : resolveDocsUrl("frame_type", getVehicleSlug(vehicleType)),
);
let orientationItem = $derived(itemIndex.get("AHRS_ORIENTATION") ?? null);
let orientationValue = $derived(params.stagedEdits.AHRS_ORIENTATION?.nextValue ?? orientationItem?.value ?? null);
let orientationLabel = $derived(
  params.metadata?.get("AHRS_ORIENTATION")?.values?.find((option) => option.code === orientationValue)?.label ??
    orientationItem?.valueLabel ??
    orientationItem?.valueText ??
    "Orientation unavailable",
);
let frameClassValue = $derived(profile.frameParamFamily === "copter" ? profile.frameClassValue : null);
let frameTypeValue = $derived(profile.frameParamFamily === "copter" ? profile.frameTypeValue : null);
let standardLayout = $derived(
  frameClassValue === null || frameTypeValue === null ? null : getMotorLayout(frameClassValue, frameTypeValue),
);
let retainedFailures = $derived(
  FRAME_RECOVERY_NAMES.map((name) => params.retainedFailures[name]).filter(
    (failure): failure is NonNullable<typeof failure> => failure != null,
  ),
);
let vehicleStateText = $derived(
  profile.isPlane
    ? "Plane airframe"
    : profile.isCopter
      ? "Multicopter airframe"
      : profile.isRover
        ? "Rover / boat"
        : "Unresolved vehicle",
);
let layoutStateText = $derived(
  profile.isPlane
    ? "VTOL layout has its own workflow"
    : standardLayout
      ? `${standardLayout.className} ${standardLayout.typeName}`
      : "Frame preview unavailable",
);

function handleVtolLinkClick(event: MouseEvent) {
  route.handleSectionLinkClick("vtol", event);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Configure airframe and board orientation"
  description="Choose the conventional multicopter frame where applicable and set the physical flight-controller orientation. QuadPlane geometry now has its own VTOL workflow."
  testId={setupWorkspaceTestIds.frameSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.frameDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={Box}
      title="Airframe summary"
      description="Frame and board-orientation edits remain staged until review and apply."
      surface="elevated"
      testId={setupWorkspaceTestIds.frameSummary}
    >
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Vehicle state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameVehicleState}>
            {vehicleStateText}
          </p>
          <HelperText class="mt-1">Vehicle type · {vehicleType ?? "Unknown"}</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Layout</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameLayoutState}>
            {layoutStateText}
          </p>
          <HelperText class="mt-1">
            {profile.isPlane
              ? "QuadPlane activation, subtype, lift motors, and transitions are configured in VTOL / QuadPlane."
              : "FRAME_CLASS and FRAME_TYPE define the conventional multicopter mixer."}
          </HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Orientation</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.frameOrientationState}>
            {orientationLabel}
          </p>
          <HelperText class="mt-1">Match this to the physical arrow and mounting rotation of the flight controller.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

    {#if retainedFailures.length > 0}
      <SetupNotice tone="danger" testId={setupWorkspaceTestIds.frameFailure}>
        <p class="font-semibold text-text-primary">Some airframe or orientation changes could not be applied.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          {#each retainedFailures as failure (failure.name)}
            <li>{failure.name} · {failure.message}</li>
          {/each}
        </ul>
      </SetupNotice>
    {/if}

    {#if profile.isPlane}
      <SetupGuideCard
        icon={PlaneTakeoff}
        title="QuadPlane settings moved to VTOL / QuadPlane"
        description="Use the dedicated workflow for Q_ENABLE, Q_FRAME_*, tiltrotor or tailsitter mechanics, transitions, QAssist, and wind hold."
      >
        <InternalLink
          class="w-fit"
          variant="button"
          href={setupSectionPath("vtol")}
          onclick={handleVtolLinkClick}
        >
          Open VTOL / QuadPlane
        </InternalLink>
      </SetupGuideCard>
    {/if}

    {#if profile.frameParamFamily === "copter"}
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SetupParamSection
          id="frame-layout"
          icon={Box}
          title="Frame configuration"
          description="Choose the conventional multicopter frame class and motor layout reported by ArduPilot."
          params={standardFrameParams}
          disabled={actionsBlocked}
          compact
          surface="elevated"
          testIdPrefix="setup-workspace-frame"
        />

        <SetupSectionCard icon={Box} title="Motor layout preview" surface="elevated" compact>
          <div class="flex min-h-56 flex-col items-center justify-center gap-3 rounded-md border border-border bg-bg-secondary/40 p-4">
            <MotorDiagram frameClass={frameClassValue} frameType={frameTypeValue} size={180} />
            <HelperText class="text-center" size="xs">
              {standardLayout
                ? `${standardLayout.motors.length} mapped motors in the selected mixer.`
                : "The selected frame is not present in the motor-layout map yet."}
            </HelperText>
          </div>
        </SetupSectionCard>
      </div>
    {/if}

    <SetupParamSection
      id="AHRS_ORIENTATION"
      icon={Compass}
      title="Board orientation"
      description="Set the physical orientation of the flight controller. The arrow should point forward unless the selected rotation explicitly compensates for another mounting direction."
      params={orientationParams}
      disabled={actionsBlocked}
      compact
      surface="elevated"
      testIdPrefix="setup-workspace-frame"
    />
  {/snippet}
</SetupSectionShell>
