<script lang="ts">
import { Cable, Gauge, GitMerge, PlaneTakeoff, Route, ShieldCheck, Wind } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { Eyebrow, HelperText, InternalLink } from "../../../../components/ui";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import VtolAssistSpeedEditor from "../../../../features/setup/components/VtolAssistSpeedEditor.svelte";
import VtolAirframeConfigurator from "../../../../features/setup/components/VtolAirframeConfigurator.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  SetupGuideCard,
  SetupNotice,
  SetupNoticeList,
  SetupParamBitmaskSection,
  SetupParamSection,
  SetupSectionCard,
  SetupStatusPill,
} from "../../../../features/setup/shared";
import { stageSetupParameterEdit } from "../../../../features/setup/shared/parameter-editing";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import { buildParameterItemIndex } from "../../../../lib/params/parameter-item-model";
import { setupSectionPath } from "../../../../lib/setup-sections";
import {
  buildVtolSetupModel,
  type VtolHandoffState,
  type VtolSetupHandoff,
} from "../../../../lib/setup/vtol-setup-model";
import { buildVtolTopologyModel } from "../../../../lib/setup/vtol-topology-model";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "vtol"));

const enableParams = [{ id: "Q_ENABLE" }] satisfies readonly SetupParamRef[];
const tiltrotorParams = [
  { id: "Q_TILT_MAX" },
  { id: "Q_TILT_RATE_UP" },
  { id: "Q_TILT_RATE_DN" },
  { id: "Q_TILT_YAW_ANGLE" },
  { id: "Q_TILT_FIX_GAIN" },
  { id: "Q_TILT_FIX_ANGLE" },
  { id: "Q_M_YAW_SV_ANGLE" },
] satisfies readonly SetupParamRef[];
const tailsitterParams = [
  { id: "Q_TAILSIT_ANGLE" },
  { id: "Q_TAILSIT_ANG_VT" },
  { id: "Q_TAILSIT_RAT_FW" },
  { id: "Q_TAILSIT_RAT_VT" },
  { id: "Q_TAILSIT_THR_VT" },
  { id: "Q_TAILSIT_INPUT" },
  { id: "Q_TAILSIT_RLL_MX" },
  { id: "Q_TAILSIT_VHGAIN" },
  { id: "Q_TAILSIT_VFGAIN" },
  { id: "Q_A_ANGLE_BOOST" },
] satisfies readonly SetupParamRef[];
const hoverParams = [
  { id: "Q_TRIM_PITCH" },
  { id: "Q_A_ANGLE_MAX", aliases: ["Q_ANGLE_MAX"] },
] satisfies readonly SetupParamRef[];
const assistTriggerParams = [
  { id: "Q_ASSIST_ANGLE" },
  { id: "Q_ASSIST_ALT" },
  { id: "Q_ASSIST_DELAY" },
  { id: "Q_ASSIST_OPTIONS" },
] satisfies readonly SetupParamRef[];
const transitionParams = [
  { id: "Q_TRANSITION_MS" },
  { id: "Q_BACKTRANS_MS" },
  { id: "Q_TRANS_DECEL" },
  { id: "Q_TRANS_FAIL" },
  { id: "Q_TRANS_FAIL_ACT" },
  { id: "Q_TRAN_PIT_MAX" },
  { id: "Q_TKOFF_ARSP_LIM" },
] satisfies readonly SetupParamRef[];
const weatherVaneParams = [
  { id: "Q_WVANE_ENABLE" },
  { id: "Q_WVANE_GAIN" },
  { id: "Q_WVANE_ANG_MIN" },
  { id: "Q_WVANE_HGT_MIN" },
  { id: "Q_WVANE_SPD_MAX" },
  { id: "Q_WVANE_VELZ_MAX" },
  { id: "Q_WVANE_TAKEOFF" },
  { id: "Q_WVANE_LAND" },
  { id: "Q_WVANE_OPTIONS" },
] satisfies readonly SetupParamRef[];
const modernForwardThrustParams = [
  { id: "Q_FWD_THR_USE" },
  { id: "Q_FWD_THR_GAIN" },
  { id: "Q_FWD_PIT_LIM" },
  { id: "Q_VFWD_ALT" },
] satisfies readonly SetupParamRef[];
const legacyForwardThrustParams = [{ id: "Q_VFWD_GAIN" }, { id: "Q_VFWD_ALT" }] satisfies readonly SetupParamRef[];
const transitionOptionBits = [
  { bit: 0, label: "Keep wings level during forward transition" },
  { bit: 7, label: "Force QAssist active" },
  { bit: 8, label: "Limit QAssist to VTOL motors" },
  { bit: 12, label: "Disable speed QAssist with synthetic airspeed" },
  { bit: 19, label: "Complete timed-out transition when airspeed permits" },
] as const;

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let vehicleType = $derived(params.vehicleType ?? session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let model = $derived(
  buildVtolSetupModel({
    vehicleType,
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
  }),
);
let assistSpeedItem = $derived(itemIndex.get("Q_ASSIST_SPEED") ?? null);
let forwardThrustParams = $derived(
  itemIndex.has("Q_FWD_THR_USE") ? modernForwardThrustParams : legacyForwardThrustParams,
);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let topology = $derived(buildVtolTopologyModel({ paramStore: params.paramStore, stagedEdits: params.stagedEdits }));
let docsUrl = $derived(resolveDocsUrl("quadplane_setup", "plane"));
let assistDocsUrl = $derived(resolveDocsUrl("quadplane_assist", "plane"));
let transitionsDocsUrl = $derived(resolveDocsUrl("quadplane_transitions", "plane"));
let windDocsUrl = $derived(resolveDocsUrl("quadplane_weathervaning", "plane"));
let subtypeDocsUrl = $derived(
  model.profile.subtype === "tiltrotor"
    ? resolveDocsUrl("quadplane_tiltrotor", "plane")
    : model.profile.subtype === "tailsitter"
      ? resolveDocsUrl("quadplane_tailsitter", "plane")
      : null,
);

function handoffTone(state: VtolHandoffState): "success" | "warning" | "muted" {
  switch (state) {
    case "available":
      return "success";
    case "blocked":
    case "needs_setup":
      return "warning";
    case "not_applicable":
    default:
      return "muted";
  }
}

function stageAssistSpeed(value: number) {
  stageSetupParameterEdit(paramsStore, assistSpeedItem, value, { actionsBlocked });
}

function handleSetupLinkClick(sectionId: VtolSetupHandoff["sectionId"], event: MouseEvent) {
  route.handleSectionLinkClick(sectionId, event);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Configure QuadPlane and VTOL flight behavior"
  description="Move from QuadPlane activation through lift-frame geometry, hover readiness, transitions, fixed-wing assistance, and wind hold. Changes remain staged until review and apply."
  testId={setupWorkspaceTestIds.vtolSection}
  docs={[{ url: docsUrl, label: "ArduPilot QuadPlane Setup", testId: setupWorkspaceTestIds.vtolDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={PlaneTakeoff}
      title="VTOL setup state"
      description="The active parameter scope determines which parts of the workflow are safe to configure."
      surface="elevated"
      testId={setupWorkspaceTestIds.vtolSummary}
    >
      <div class="grid gap-4 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Vehicle state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.vtolVehicleState}>
            {model.stateText}
          </p>
          <HelperText class="mt-1">{model.detailText}</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Airframe subtype</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">
            {model.profile.subtype ?? "Not active"}
          </p>
          <HelperText class="mt-1">
            {topology.proposed.supportedDiagram
              ? `${topology.proposed.frameClassLabel} ${topology.proposed.frameTypeLabel}`
              : "The lift-motor layout appears after the refreshed Q_FRAME family is available."}
          </HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Fixed-wing assistance</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.vtolAssistState}>
            {model.assist.stateText}
          </p>
          <HelperText class="mt-1">{model.assist.detailText}</HelperText>
        </div>
      </div>
    </SetupSectionCard>

    <SetupNoticeList notices={model.notices} testIdPrefix={setupWorkspaceTestIds.vtolBannerPrefix} />

    {#if !model.applicable}
      <SetupNotice tone="info" testId={setupWorkspaceTestIds.vtolRecovery}>
        VTOL / QuadPlane setup is available when the active vehicle reports Plane firmware and exposes Q_ENABLE.
      </SetupNotice>
    {:else}
      <SetupParamSection
        id="enable"
        icon={PlaneTakeoff}
        title="Enable QuadPlane"
        description="Enable the VTOL parameter family, then apply, reboot, and refresh before continuing."
        params={enableParams}
        disabled={actionsBlocked}
        compact
        surface="elevated"
        testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
      />

      {#if model.profile.quadPlaneEnabled}
        <VtolAirframeConfigurator {topology} {actionsBlocked} />
      {/if}

      {#if model.profile.planeVtolState === "vtol-ready"}
        {#if model.profile.subtype === "tiltrotor"}
          <SetupParamSection
            id="tiltrotor"
            icon={GitMerge}
            title="Tilt movement and advanced behavior"
            description="Adjust transition angles, measured mechanism rates, and optional fixed-wing tilt assistance after the motor-to-actuator topology is correct."
            docsUrl={subtypeDocsUrl}
            params={tiltrotorParams}
            disabled={actionsBlocked}
            surface="elevated"
            testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
          />
        {:else if model.profile.subtype === "tailsitter"}
          <SetupParamSection
            id="tailsitter"
            icon={PlaneTakeoff}
            title="Tailsitter mechanics"
            description="Configure controller handover angles, transition rates, hover input convention, and tailsitter motor behavior."
            docsUrl={subtypeDocsUrl}
            params={tailsitterParams}
            disabled={actionsBlocked}
            surface="elevated"
            testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
          />
        {/if}

        <SetupParamSection
          id="hover"
          icon={Gauge}
          title="Hover attitude envelope"
          description="Set the VTOL trim offset and lean envelope before progressing from QSTABILIZE to altitude-hold modes. Hover-throttle learning stays with the lift powertrain in Motors & ESC."
          params={hoverParams}
          disabled={actionsBlocked}
          surface="elevated"
          testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
        />

        <SetupSectionCard
          icon={ShieldCheck}
          title="Fixed-wing assistance"
          description="Choose the primary airspeed trigger, then add attitude or altitude triggers only when the primary threshold is positive."
          docsUrl={assistDocsUrl}
          surface="elevated"
        >
          {#if assistSpeedItem && model.assist.value !== null}
            <VtolAssistSpeedEditor
              item={assistSpeedItem}
              value={model.assist.value}
              suggestedSpeedMps={model.assist.suggestedSpeedMps}
              minimumAirspeedMps={model.assist.minimumAirspeedMps}
              airspeedSensorConfigured={model.assist.airspeedSensorConfigured}
              disabled={actionsBlocked}
              stagedName={params.stagedEdits[assistSpeedItem.name] ? assistSpeedItem.name : undefined}
              stagedTestId={setupWorkspaceTestIds.vtolAssistStaged}
              onUnstage={paramsStore.discardStagedEdit}
              onValueChange={stageAssistSpeed}
              modeTestId={setupWorkspaceTestIds.vtolAssistMode}
              inputTestId={setupWorkspaceTestIds.vtolAssistInput}
            />
          {/if}
        </SetupSectionCard>

        <SetupParamSection
          id="assist-triggers"
          icon={ShieldCheck}
          title="Additional QAssist triggers"
          description="Attitude, altitude, and delay triggers depend on a positive Q_ASSIST_SPEED threshold. Zero disables each optional trigger."
          docsUrl={assistDocsUrl}
          params={assistTriggerParams}
          disabled={actionsBlocked || model.assist.state !== "active"}
          surface="elevated"
          testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
        />

        <SetupParamSection
          id="transitions"
          icon={GitMerge}
          title="Forward and back transitions"
          description="Control transition timing, stopping-distance estimation, timeout behavior, and pitch limits. Validate changes in controlled flight."
          docsUrl={transitionsDocsUrl}
          params={transitionParams}
          disabled={actionsBlocked}
          surface="elevated"
          testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
        />

        <SetupParamBitmaskSection
          id="transition-options"
          icon={GitMerge}
          title="Transition and assistance options"
          description="Only transition and QAssist bits are exposed here; unrelated Q_OPTIONS bits are preserved."
          docsUrl={transitionsDocsUrl}
          param={{ id: "Q_OPTIONS" }}
          bitmaskOptions={transitionOptionBits}
          disabled={actionsBlocked}
          surface="elevated"
          testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
        />

        <SetupParamSection
          id="weathervane"
          icon={Wind}
          title="Weathervaning and wind limits"
          description="Turn into the wind in position-controlled VTOL modes and bound activation by height and vehicle speed."
          docsUrl={windDocsUrl}
          params={weatherVaneParams}
          disabled={actionsBlocked}
          surface="elevated"
          testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
        />

        {#if model.profile.subtype !== "tailsitter"}
          <SetupParamSection
            id="forward-thrust"
            icon={Wind}
            title="Forward-thrust position hold"
            description="Use the forward motor or tilting rotors to reduce pitch and lift-motor load while holding position in wind."
            docsUrl={windDocsUrl}
            params={forwardThrustParams}
            disabled={actionsBlocked}
            surface="elevated"
            testIdPrefix={setupWorkspaceTestIds.vtolParamPrefix}
          />
        {/if}
      {/if}

      <SetupSectionCard
        icon={Route}
        title="Continue the VTOL workflow"
        description="Shared setup concerns keep one editing home while this section tracks their availability."
        surface="elevated"
      >
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {#each model.handoffs as handoff (handoff.id)}
            <div
              class="flex min-w-0 flex-col rounded-lg border border-border bg-bg-primary/70 p-3"
              data-testid={`${setupWorkspaceTestIds.vtolHandoffPrefix}-${handoff.id}`}
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <p class="text-sm font-semibold text-text-primary">{handoff.title}</p>
                <SetupStatusPill tone={handoffTone(handoff.state)}>{handoff.stateText}</SetupStatusPill>
              </div>
              <HelperText class="mt-2 flex-1">{handoff.detailText}</HelperText>
              <InternalLink
                class="mt-3"
                variant="button"
                href={setupSectionPath(handoff.sectionId)}
                onclick={(event) => handleSetupLinkClick(handoff.sectionId, event)}
              >
                Open {handoff.title}
              </InternalLink>
            </div>
          {/each}
        </div>
      </SetupSectionCard>

      <SetupGuideCard icon={Cable} title="Ground and first-flight sequence">
        <p>Verify output mapping and motor order with propellers removed, then establish a stable QSTABILIZE hover before testing QHOVER or QLOITER.</p>
        <p>Only test forward transitions after the lift system, hover controllers, airspeed source, and battery voltage under combined motor load have been verified.</p>
      </SetupGuideCard>
    {/if}
  {/snippet}
</SetupSectionShell>
