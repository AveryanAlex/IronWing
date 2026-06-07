<script lang="ts">
import { Compass, Gauge, MapPin, Navigation as NavigationIcon, Radio, Route, Satellite } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildSerialPortModel } from "../../../../lib/setup/serial-port-model";
import { selectTelemetryView } from "../../../../lib/telemetry-selectors";
import type { ParamMeta } from "../../../../param-metadata";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { HelperText } from "../../../../components/ui";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupTelemetryCard from "../../../../features/setup/shared/SetupTelemetryCard.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "navigation"));

type TelemetryTone = "neutral" | "info" | "success" | "warning" | "danger";
type NavigationLiveObservation = {
  scopeKey: string;
  fixType: string | null;
  satellites: number | null;
  hdop: number | null;
  latitude: number | null;
  longitude: number | null;
  partial: boolean;
};

const receiverParams = [
  { id: "GPS1_TYPE", aliases: ["GPS_TYPE"] },
  { id: "GPS_AUTO_CONFIG" },
] satisfies readonly SetupParamRef[];

const compassParams = [
  { id: "COMPASS_ENABLE" },
  { id: "COMPASS_USE" },
  { id: "COMPASS_AUTO_ROT" },
  { id: "COMPASS_ORIENT" },
  { id: "COMPASS_DEV_ID" },
] satisfies readonly SetupParamRef[];

const barometerParams = [
  { id: "BARO_PRIMARY" },
  { id: "BARO_ALT_OFFSET", aliases: ["GND_ALT_OFFSET"] },
  { id: "BARO1_GND_PRESS", aliases: ["GND_ABS_PRESS"] },
  { id: "BARO_GND_TEMP", aliases: ["GND_TEMP"] },
  { id: "BARO_ALTERR_MAX" },
] satisfies readonly SetupParamRef[];

const estimatorParams = [
  { id: "AHRS_EKF_TYPE" },
  { id: "AHRS_GPS_USE" },
  { id: "EK3_SRC1_POSXY" },
  { id: "EK3_SRC1_VELXY" },
  { id: "EK3_SRC1_POSZ" },
  { id: "EK3_SRC1_VELZ" },
  { id: "EK3_SRC1_YAW" },
] satisfies readonly SetupParamRef[];

const waypointParams = [
  { id: "WP_SPD", aliases: ["WPNAV_SPEED"] },
  { id: "WP_ACC", aliases: ["WPNAV_ACCEL"] },
  { id: "WP_SPD_UP", aliases: ["WPNAV_SPEED_UP"] },
  { id: "WP_SPD_DN", aliases: ["WPNAV_SPEED_DN"] },
  { id: "WP_RADIUS_M", aliases: ["WP_RADIUS"] },
] satisfies readonly SetupParamRef[];

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let lastScopedNavigationObservation = $state<NavigationLiveObservation | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let serialModel = $derived(
  buildSerialPortModel({
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
let docsUrl = $derived(resolveDocsUrl("positioning_gps_compass"));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let primaryTypeParamName = $derived(resolvePrimaryReceiverTypeParam(params.paramStore, params.stagedEdits));
let primaryTypeItem = $derived(primaryTypeParamName ? (itemIndex.get(primaryTypeParamName) ?? null) : null);
let gnssModeItem = $derived(itemIndex.get("GPS_GNSS_MODE") ?? null);
let gnssCurrentValue = $derived(resolveCurrentGnssMask(gnssModeItem, params.stagedEdits));
let gnssItems = $derived(buildGnssItems(params.metadata?.get("GPS_GNSS_MODE"), gnssCurrentValue));
let liveObservation = $derived(resolveLiveObservation(telemetry, view.activeScopeKey));
let liveSummary = $derived.by(() => {
  if (liveObservation && liveConnected) {
    return {
      stateText: liveObservation.partial ? "Updating" : "Current",
      stateTone: liveObservation.partial ? ("warning" as TelemetryTone) : ("success" as TelemetryTone),
      stale: false,
      observation: liveObservation,
    };
  }

  if (
    view.activeScopeKey &&
    lastScopedNavigationObservation &&
    lastScopedNavigationObservation.scopeKey === view.activeScopeKey &&
    (!liveConnected || session.telemetryDomain.complete === false)
  ) {
    return {
      stateText: "Last update",
      stateTone: "warning" as TelemetryTone,
      stale: true,
      observation: lastScopedNavigationObservation,
    };
  }

  return {
    stateText: "No telemetry",
    stateTone: "neutral" as TelemetryTone,
    stale: false,
    observation: null,
  };
});
let primaryReceiverEnabled = $derived(isReceiverEnabled(primaryTypeItem, params.stagedEdits));
let portStateText = $derived.by(() => {
  if (!primaryReceiverEnabled) {
    return "GNSS receiver disabled";
  }

  if (serialModel.gpsPorts.length === 0) {
    return "No GNSS serial port assigned";
  }

  return serialModel.gpsPorts.join(", ");
});
let portDetailText = $derived.by(() => {
  if (!primaryReceiverEnabled) {
    return "Enable a GNSS receiver type before checking fix quality.";
  }

  if (serialModel.gpsPorts.length === 0) {
    return "Set a SERIAL port to protocol 5 before relying on navigation.";
  }

  return "Serial protocol 5 is assigned.";
});
let navigationTelemetryMetrics = $derived.by(() => {
  const observation = liveSummary.observation;
  const hasPosition = observation?.latitude !== null && observation?.longitude !== null;

  return [
    {
      label: "Fix",
      value: observation ? formatFixType(observation.fixType) : "—",
      tone:
        observation?.fixType && observation.fixType !== "no_gps" && observation.fixType !== "no_fix"
          ? ("success" as TelemetryTone)
          : ("neutral" as TelemetryTone),
      stale: liveSummary.stale,
      unavailable: observation === null,
      testId: setupWorkspaceTestIds.navigationLiveDetail,
    },
    {
      label: "Satellites",
      value: observation?.satellites === null || observation === null ? "—" : String(observation.satellites),
      mono: true,
      stale: liveSummary.stale,
      unavailable: observation?.satellites === null || observation === null,
    },
    {
      label: "HDOP",
      value: observation ? formatHdop(observation.hdop) : "—",
      mono: true,
      stale: liveSummary.stale,
      unavailable: observation?.hdop === null || observation === null,
    },
    {
      label: "Position",
      value:
        hasPosition && observation
          ? `${formatCoordinate(observation.latitude)}, ${formatCoordinate(observation.longitude)}`
          : "—",
      mono: true,
      stale: liveSummary.stale,
      unavailable: !hasPosition,
    },
    {
      label: "Serial",
      value: portStateText,
      detail: portDetailText,
      tone:
        primaryReceiverEnabled && serialModel.gpsPorts.length > 0
          ? ("success" as TelemetryTone)
          : primaryReceiverEnabled
            ? ("warning" as TelemetryTone)
            : ("neutral" as TelemetryTone),
      unavailable: !primaryReceiverEnabled,
      testId: setupWorkspaceTestIds.navigationPortState,
    },
  ];
});

$effect(() => {
  if (liveObservation && view.activeScopeKey) {
    lastScopedNavigationObservation = liveObservation;
  }
});

function resolvePrimaryReceiverTypeParam(
  paramStore: typeof params.paramStore,
  stagedEdits: typeof params.stagedEdits,
): string | null {
  if (paramStore?.params.GPS1_TYPE !== undefined || stagedEdits.GPS1_TYPE) {
    return "GPS1_TYPE";
  }

  if (paramStore?.params.GPS_TYPE !== undefined || stagedEdits.GPS_TYPE) {
    return "GPS_TYPE";
  }

  return null;
}

function buildGnssItems(meta: ParamMeta | undefined, currentMask: number | null) {
  const bitmask = meta?.bitmask;
  if (!Array.isArray(bitmask) || currentMask === null || !Number.isInteger(currentMask) || currentMask < 0) {
    return [];
  }

  return bitmask
    .filter(
      (entry) => Number.isInteger(entry.bit) && entry.bit >= 0 && entry.bit <= 31 && entry.label.trim().length > 0,
    )
    .map((entry) => ({
      key: String(entry.bit),
      bit: entry.bit,
      label: entry.label,
      checked: (currentMask & (1 << entry.bit)) !== 0,
    }));
}

function resolveCurrentGnssMask(
  item: ParameterItemModel | null,
  stagedEdits: typeof params.stagedEdits,
): number | null {
  const stagedValue = stagedEdits.GPS_GNSS_MODE?.nextValue;
  if (typeof stagedValue === "number" && Number.isInteger(stagedValue) && stagedValue >= 0) {
    return stagedValue;
  }

  return item && Number.isInteger(item.value) && item.value >= 0 ? item.value : null;
}

function toggleGnssBit(bit: number) {
  if (!gnssModeItem || actionsBlocked || gnssItems.length === 0 || gnssModeItem.readOnly === true) {
    return;
  }

  const currentMask = gnssCurrentValue ?? gnssModeItem.value;
  const nextMask = currentMask ^ (1 << bit);
  paramsStore.stageParameterEdit(gnssModeItem, nextMask);
}

function setGnssMask(checked: boolean) {
  if (!gnssModeItem || actionsBlocked || gnssItems.length === 0 || gnssModeItem.readOnly === true) {
    return;
  }

  const nextMask = checked ? gnssItems.reduce((mask, item) => mask | (1 << item.bit), 0) : 0;
  paramsStore.stageParameterEdit(gnssModeItem, nextMask);
}

function isReceiverEnabled(item: ParameterItemModel | null, stagedEdits: typeof params.stagedEdits): boolean {
  if (!item) {
    return false;
  }

  const stagedValue = stagedEdits[item.name]?.nextValue;
  const value = typeof stagedValue === "number" ? stagedValue : item.value;
  return value > 0;
}

function resolveLiveObservation(
  telemetryView: ReturnType<typeof selectTelemetryView>,
  scopeKey: string | null,
): NavigationLiveObservation | null {
  if (!scopeKey) {
    return null;
  }

  const fixType =
    typeof telemetryView.gps_fix_type === "string" && telemetryView.gps_fix_type.trim().length > 0
      ? telemetryView.gps_fix_type
      : null;
  const satellites =
    typeof telemetryView.gps_satellites === "number" && Number.isFinite(telemetryView.gps_satellites)
      ? Math.round(telemetryView.gps_satellites)
      : null;
  const hdop =
    typeof telemetryView.gps_hdop === "number" && Number.isFinite(telemetryView.gps_hdop)
      ? telemetryView.gps_hdop
      : null;
  const latitude =
    typeof telemetryView.latitude_deg === "number" && Number.isFinite(telemetryView.latitude_deg)
      ? telemetryView.latitude_deg
      : null;
  const longitude =
    typeof telemetryView.longitude_deg === "number" && Number.isFinite(telemetryView.longitude_deg)
      ? telemetryView.longitude_deg
      : null;

  if (fixType === null && satellites === null && hdop === null && latitude === null && longitude === null) {
    return null;
  }

  return {
    scopeKey,
    fixType,
    satellites,
    hdop,
    latitude,
    longitude,
    partial: fixType === null || satellites === null || hdop === null || latitude === null || longitude === null,
  };
}

function formatFixType(fixType: string | null): string {
  switch (fixType) {
    case "no_gps":
      return "No receiver";
    case "no_fix":
      return "No Fix";
    case "fix_2d":
      return "2D Fix";
    case "fix_3d":
      return "3D Fix";
    case "dgps":
      return "DGPS";
    case "rtk_float":
      return "RTK Float";
    case "rtk_fixed":
      return "RTK Fixed";
    default:
      return fixType ?? "Unknown";
  }
}

function formatCoordinate(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(7)}°`;
}

function formatHdop(value: number | null): string {
  return value === null ? "--" : value.toFixed(1);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Review navigation sensors and guidance"
  description="Check the primary GNSS receiver, constellation selections, compass heading source, barometer altitude reference, and navigation guidance settings from one place. If a setting is unavailable for this firmware, the matching editor is hidden or read-only."
  testId={setupWorkspaceTestIds.navigationSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.navigationDocsLink }]}
>
  {#snippet body()}
  <SetupTelemetryCard
    icon={Satellite}
    title="Current navigation fix"
    description="Latest primary receiver fix, satellite count, position, and serial assignment."
    statusText={liveSummary.stateText}
    statusTone={liveSummary.stateTone}
    statusTestId={setupWorkspaceTestIds.navigationLiveState}
    metrics={navigationTelemetryMetrics}
    columns={5}
    testId={setupWorkspaceTestIds.navigationSummary}
  />

  {#if primaryReceiverEnabled && serialModel.gpsPorts.length === 0}
    <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.navigationBannerPrefix}-serial`}>
      No GNSS serial port is configured yet. Use Serial Ports before relying on navigation checks.
    </SetupNotice>
  {/if}

  <SetupParamSection
    id="receiver"
    icon={Radio}
    title="GNSS receiver configuration"
    description="Choose the primary receiver behavior and module auto-configuration from one grouped card."
    params={receiverParams}
    disabled={actionsBlocked}
    testIdPrefix="setup-workspace-navigation"
  />

  <SetupSectionCard
    icon={MapPin}
    title="GNSS constellation mask"
    description={gnssModeItem ? (gnssModeItem.description ?? "Choose which satellite constellations the GNSS receiver should keep enabled.") : "No matching constellation settings are available for this firmware."}
    compact
    testId={setupWorkspaceTestIds.navigationGnssChecklist}
  >
      {#if params.stagedEdits.GPS_GNSS_MODE}
        <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.navigationStagedPrefix}-GPS_GNSS_MODE`}>
          Queued · {params.stagedEdits.GPS_GNSS_MODE.nextValueText}
        </p>
      {/if}

    {#if gnssItems.length > 0}
      <SetupBitmaskTable
        clearAllLabel="Use receiver default"
        description="Select the satellite constellations to request from the receiver. Clearing all bits leaves the receiver's default constellation settings in place."
        disabled={actionsBlocked || gnssModeItem?.readOnly === true}
        embedded
        items={gnssItems.map((item) => ({
          key: item.key,
          label: item.label,
          description: `Bit ${item.bit}`,
          checked: item.checked,
        }))}
        onSetAll={setGnssMask}
        onToggle={(item) => toggleGnssBit(Number(item.key))}
        title="Available constellations"
      />
    {:else}
      <HelperText tone="muted">No matching settings are available for this firmware.</HelperText>
    {/if}
  </SetupSectionCard>

  <SetupParamSection
    id="compass"
    icon={Compass}
    title="Compass heading source"
    description="Review which compass sensors provide heading data. Calibration actions stay in Calibration; this card focuses on the settings navigation uses after calibration."
    params={compassParams}
    disabled={actionsBlocked}
    testIdPrefix="setup-workspace-navigation"
  />

  <SetupParamSection
    id="barometer"
    icon={Gauge}
    title="Barometer altitude reference"
    description="Review the pressure and ground-reference settings that support altitude estimates when the firmware exposes them."
    params={barometerParams}
    disabled={actionsBlocked}
    testIdPrefix="setup-workspace-navigation"
  />

  <SetupParamSection
    id="estimator"
    icon={NavigationIcon}
    title="Estimator source selection"
    description="Review AHRS and EKF source selections for GNSS, barometer, compass, and other navigation inputs."
    params={estimatorParams}
    disabled={actionsBlocked}
    testIdPrefix="setup-workspace-navigation"
  />

  <SetupParamSection
    id="waypoint"
    icon={Route}
    title="Waypoint guidance"
    description="Review speed, acceleration, and arrival-radius settings used by guided and waypoint navigation."
    params={waypointParams}
    disabled={actionsBlocked}
    testIdPrefix="setup-workspace-navigation"
  />
  {/snippet}
</SetupSectionShell>
