<script lang="ts">
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildSerialPortModel } from "../../../../lib/setup/serial-port-model";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { selectTelemetryView } from "../../../../lib/telemetry-selectors";
import type { ParamMeta } from "../../../../param-metadata";
import SetupBitmaskChecklist from "../../../../features/setup/shared/SetupBitmaskChecklist.svelte";
import SetupParamEnumControl from "../../../../features/setup/shared/SetupParamEnumControl.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import {
  Alert,
  Card,
  EmptyState,
  Eyebrow,
  HelperText,
  StagedBadge as SetupStagedBadge,
} from "../../../../components/ui";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "gps"));

type EnumOption = { code: number; label: string };
type GpsLiveObservation = {
  scopeKey: string;
  fixType: string | null;
  satellites: number | null;
  hdop: number | null;
  latitude: number | null;
  longitude: number | null;
  partial: boolean;
};

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let lastScopedGpsObservation = $state<GpsLiveObservation | null>(null);

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
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let primaryTypeParamName = $derived(resolvePrimaryGpsTypeParam(params.paramStore, params.stagedEdits));
let primaryTypeItem = $derived(primaryTypeParamName ? (itemIndex.get(primaryTypeParamName) ?? null) : null);
let secondaryTypeItem = $derived(itemIndex.get("GPS2_TYPE") ?? null);
let autoSwitchItem = $derived(itemIndex.get("GPS_AUTO_SWITCH") ?? null);
let autoConfigItem = $derived(itemIndex.get("GPS_AUTO_CONFIG") ?? null);
let gnssModeItem = $derived(itemIndex.get("GPS_GNSS_MODE") ?? null);
let primaryTypeOptions = $derived(
  resolveEnumOptions(primaryTypeParamName ? params.metadata?.get(primaryTypeParamName)?.values : undefined),
);
let secondaryTypeOptions = $derived(resolveEnumOptions(params.metadata?.get("GPS2_TYPE")?.values));
let autoSwitchOptions = $derived(resolveEnumOptions(params.metadata?.get("GPS_AUTO_SWITCH")?.values));
let autoConfigOptions = $derived(resolveEnumOptions(params.metadata?.get("GPS_AUTO_CONFIG")?.values));
let primaryTypeDraft = $derived(
  String(params.stagedEdits[primaryTypeParamName ?? ""]?.nextValue ?? primaryTypeItem?.value ?? ""),
);
let secondaryTypeDraft = $derived(String(params.stagedEdits.GPS2_TYPE?.nextValue ?? secondaryTypeItem?.value ?? ""));
let autoSwitchDraft = $derived(String(params.stagedEdits.GPS_AUTO_SWITCH?.nextValue ?? autoSwitchItem?.value ?? ""));
let autoConfigDraft = $derived(String(params.stagedEdits.GPS_AUTO_CONFIG?.nextValue ?? autoConfigItem?.value ?? ""));
let gnssCurrentValue = $derived(resolveCurrentGnssMask(gnssModeItem, params.stagedEdits));
let gnssItems = $derived(buildGnssItems(params.metadata?.get("GPS_GNSS_MODE"), gnssCurrentValue));
let liveObservation = $derived(resolveLiveObservation(telemetry, view.activeScopeKey));
let liveSummary = $derived.by(() => {
  if (liveObservation && liveConnected) {
    return {
      stateText: liveObservation.partial ? "Live, partial" : "Live",
      detailText: liveObservation.partial
        ? "The latest GPS payload is incomplete, so the section keeps partial lock data visible without claiming full readiness."
        : "Live GPS lock, satellites, and position are visible for this scope.",
      observation: liveObservation,
    };
  }

  if (
    view.activeScopeKey &&
    lastScopedGpsObservation &&
    lastScopedGpsObservation.scopeKey === view.activeScopeKey &&
    (!liveConnected || session.telemetryDomain.complete === false)
  ) {
    return {
      stateText: "Stale, same scope",
      detailText: "Last same-scope GPS lock was retained while telemetry settles or the link reconnects.",
      observation: lastScopedGpsObservation,
    };
  }

  return {
    stateText: section.availability === "blocked" ? "Blocked / unknown" : "Waiting for GPS facts",
    detailText:
      section.availability === "blocked"
        ? "The section stays inspectable, but GPS editors are blocked until metadata and the live scope are trustworthy again."
        : "Connect a live vehicle and wait for GPS telemetry to inspect fix quality.",
    observation: null,
  };
});
let primaryGpsEnabled = $derived(isGpsEnabled(primaryTypeItem, params.stagedEdits));
let secondaryGpsVisible = $derived(Boolean(secondaryTypeItem || params.stagedEdits.GPS2_TYPE));
let recoveryReasons = $derived.by(() => {
  const reasons: string[] = [];

  if (!primaryTypeItem) {
    reasons.push("Neither GPS1_TYPE nor GPS_TYPE is available in the current parameter store.");
  } else if (primaryTypeOptions.length === 0) {
    reasons.push(
      `${primaryTypeItem.name} metadata is missing or malformed, so the primary GPS type selector stays read-only.`,
    );
  }

  if (secondaryGpsVisible && secondaryTypeItem && secondaryTypeOptions.length === 0) {
    reasons.push("GPS2_TYPE metadata is missing or malformed, so the secondary GPS selector stays read-only.");
  }

  if (autoSwitchItem && autoSwitchOptions.length === 0) {
    reasons.push("GPS_AUTO_SWITCH metadata is missing or malformed, so auto-switch staging stays read-only.");
  }

  if (autoConfigItem && autoConfigOptions.length === 0) {
    reasons.push("GPS_AUTO_CONFIG metadata is missing or malformed, so auto-config staging stays read-only.");
  }

  if (gnssModeItem && gnssItems.length === 0) {
    reasons.push(
      "GPS_GNSS_MODE bitmask metadata is missing or malformed, so GNSS constellation staging stays read-only.",
    );
  }

  return reasons;
});
let bannerTone = $derived.by(() => {
  if (recoveryReasons.length > 0) {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  if (primaryGpsEnabled && serialModel.gpsPorts.length === 0) {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  return "border-border bg-bg-primary/80 text-text-secondary";
});
let portStateText = $derived.by(() => {
  if (!primaryGpsEnabled) {
    return "GPS disabled";
  }

  if (serialModel.gpsPorts.length === 0) {
    return "No GPS serial port assigned";
  }

  return `GPS on ${serialModel.gpsPorts.join(", ")}`;
});
let portDetailText = $derived.by(() => {
  if (!primaryGpsEnabled) {
    return "Enable a GPS receiver type before expecting lock data or port assignment here.";
  }

  if (serialModel.gpsPorts.length === 0) {
    return "No SERIALn port is currently assigned to GPS (protocol 5). Fix the port assignment in Serial Ports before claiming navigation readiness.";
  }

  return `The current scope assigns GPS protocol ownership to ${serialModel.gpsPorts.join(", ")}.`;
});

$effect(() => {
  if (liveObservation && view.activeScopeKey) {
    lastScopedGpsObservation = liveObservation;
  }
});

function resolvePrimaryGpsTypeParam(
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

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function stage(item: ParameterItemModel | null, draftValue: string, optionsReady: boolean) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || actionsBlocked || !optionsReady) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
}

function unstage(name: string) {
  paramsStore.discardStagedEdit(name);
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

function isGpsEnabled(item: ParameterItemModel | null, stagedEdits: typeof params.stagedEdits): boolean {
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
): GpsLiveObservation | null {
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
      return "No GPS";
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
  title="Review GPS receivers, GNSS options, and lock status"
  description="Check receiver type, optional second-receiver settings, GNSS selections, and live fix quality here. If metadata is missing or a port is unassigned, this section shows what is blocked and where to go next."
  testId={setupWorkspaceTestIds.gpsSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.gpsDocsLink }]}
>
  {#snippet body()}
      <Card.Root class="grid md:grid-cols-3" density="compact" gap="compact" testId={setupWorkspaceTestIds.gpsSummary}>
    <div>
      <Eyebrow tracking="widest">Live GPS state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.gpsLiveState}>
        {liveSummary.stateText}
      </p>
      <HelperText class="mt-1" testId={setupWorkspaceTestIds.gpsLiveDetail}>
        {liveSummary.detailText}
      </HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Serial assignment</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.gpsPortState}>
        {portStateText}
      </p>
      <HelperText class="mt-1">{portDetailText}</HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Fix snapshot</Eyebrow>
      {#if liveSummary.observation}
        <p class="mt-2 text-sm font-semibold text-text-primary">
          {formatFixType(liveSummary.observation.fixType)} · {liveSummary.observation.satellites ?? "--"} sats
        </p>
        <HelperText class="mt-1">
          HDOP {formatHdop(liveSummary.observation.hdop)} · {formatCoordinate(liveSummary.observation.latitude)}, {formatCoordinate(liveSummary.observation.longitude)}
        </HelperText>
      {:else}
        <HelperText class="mt-2">No scoped GPS sample yet.</HelperText>
      {/if}
    </div>
  </Card.Root>

  {#if recoveryReasons.length > 0 || (primaryGpsEnabled && serialModel.gpsPorts.length === 0)}
      <Alert
        variant="warning"
        density="compact"
        shadow={false}
        class={bannerTone}
      testId={`${setupWorkspaceTestIds.gpsBannerPrefix}-${recoveryReasons.length > 0 ? "recovery" : "serial"}`}
    >
      {#if recoveryReasons.length > 0}
        <p class="font-semibold text-text-primary">This GPS section is staying fail-closed instead of inventing selectors from partial metadata.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          {#each recoveryReasons as reason (reason)}
            <li>{reason}</li>
          {/each}
        </ul>
      {:else}
        No GPS serial port is configured yet. Use Serial Ports before claiming navigation readiness.
      {/if}
    </Alert>
  {/if}

  <div class="grid gap-3 xl:grid-cols-2">
    {#if primaryTypeItem}
      <Card.Root as="article" density="compact">
        <h4 class="text-base font-semibold text-text-primary">{primaryTypeItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {primaryTypeItem.description ?? "Choose the primary GPS receiver type without bypassing the shared review tray."}
        </p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.gpsCurrentPrefix}-${primaryTypeItem.name}`}>
          Current · {currentValueText(primaryTypeItem)}
        </Eyebrow>
        {#if params.stagedEdits[primaryTypeItem.name]}
          <p class="mt-2">
            <SetupStagedBadge name={primaryTypeItem.name} onUnstage={unstage} testId={`${setupWorkspaceTestIds.gpsStagedPrefix}-${primaryTypeItem.name}`} />
          </p>
        {/if}
        <div class="mt-4">
          <SetupParamEnumControl
            disabled={actionsBlocked || primaryTypeOptions.length === 0}
            id={`setup-gps-${primaryTypeItem.name}`}
            onChange={(value) => stage(primaryTypeItem, value, primaryTypeOptions.length > 0)}
            options={primaryTypeOptions}
            testId={`${setupWorkspaceTestIds.gpsInputPrefix}-${primaryTypeItem.name}`}
            value={primaryTypeDraft}
          />
        </div>
      </Card.Root>
    {/if}

    {#if autoConfigItem}
      <Card.Root as="article" density="compact">
        <h4 class="text-base font-semibold text-text-primary">{autoConfigItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">
          {autoConfigItem.description ?? "Review module auto-configuration here and queue changes through the review tray."}
        </p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.gpsCurrentPrefix}-GPS_AUTO_CONFIG`}>
          Current · {currentValueText(autoConfigItem)}
        </Eyebrow>
        {#if params.stagedEdits.GPS_AUTO_CONFIG}
          <p class="mt-2">
            <SetupStagedBadge name="GPS_AUTO_CONFIG" onUnstage={unstage} testId={`${setupWorkspaceTestIds.gpsStagedPrefix}-GPS_AUTO_CONFIG`} />
          </p>
        {/if}
        <div class="mt-4">
          <SetupParamEnumControl
            disabled={actionsBlocked || autoConfigOptions.length === 0}
            id="setup-gps-auto-config"
            onChange={(value) => stage(autoConfigItem, value, autoConfigOptions.length > 0)}
            options={autoConfigOptions}
            testId={`${setupWorkspaceTestIds.gpsInputPrefix}-GPS_AUTO_CONFIG`}
            value={autoConfigDraft}
          />
        </div>
      </Card.Root>
    {/if}
  </div>

  {#if secondaryGpsVisible || autoSwitchItem}
    <div class="grid gap-3 xl:grid-cols-2">
      {#if secondaryTypeItem}
        <Card.Root as="article" density="compact">
          <h4 class="text-base font-semibold text-text-primary">{secondaryTypeItem.label}</h4>
          <p class="mt-2 text-sm text-text-secondary">
            {secondaryTypeItem.description ?? "Inspect the optional second GPS receiver here when the firmware exposes it."}
          </p>
          <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.gpsCurrentPrefix}-GPS2_TYPE`}>
            Current · {currentValueText(secondaryTypeItem)}
          </Eyebrow>
          {#if params.stagedEdits.GPS2_TYPE}
            <p class="mt-2">
              <SetupStagedBadge name="GPS2_TYPE" onUnstage={unstage} testId={`${setupWorkspaceTestIds.gpsStagedPrefix}-GPS2_TYPE`} />
            </p>
          {/if}
          <div class="mt-4">
            <SetupParamEnumControl
              disabled={actionsBlocked || secondaryTypeOptions.length === 0}
              id="setup-gps-secondary-type"
              onChange={(value) => stage(secondaryTypeItem, value, secondaryTypeOptions.length > 0)}
              options={secondaryTypeOptions}
              testId={`${setupWorkspaceTestIds.gpsInputPrefix}-GPS2_TYPE`}
              value={secondaryTypeDraft}
            />
          </div>
        </Card.Root>
      {/if}

      {#if autoSwitchItem}
        <Card.Root as="article" density="compact">
          <h4 class="text-base font-semibold text-text-primary">{autoSwitchItem.label}</h4>
          <p class="mt-2 text-sm text-text-secondary">
            {autoSwitchItem.description ?? "Review primary/secondary GPS switching here and queue changes through the review tray."}
          </p>
          <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.gpsCurrentPrefix}-GPS_AUTO_SWITCH`}>
            Current · {currentValueText(autoSwitchItem)}
          </Eyebrow>
          {#if params.stagedEdits.GPS_AUTO_SWITCH}
            <p class="mt-2">
              <SetupStagedBadge name="GPS_AUTO_SWITCH" onUnstage={unstage} testId={`${setupWorkspaceTestIds.gpsStagedPrefix}-GPS_AUTO_SWITCH`} />
            </p>
          {/if}
          <div class="mt-4">
            <SetupParamEnumControl
              disabled={actionsBlocked || autoSwitchOptions.length === 0}
              id="setup-gps-auto-switch"
              onChange={(value) => stage(autoSwitchItem, value, autoSwitchOptions.length > 0)}
              options={autoSwitchOptions}
              testId={`${setupWorkspaceTestIds.gpsInputPrefix}-GPS_AUTO_SWITCH`}
              value={autoSwitchDraft}
            />
          </div>
        </Card.Root>
      {/if}
    </div>
  {/if}

  <Card.Root density="compact" testId={setupWorkspaceTestIds.gpsGnssChecklist}>
    <div class="mb-3">
      <Eyebrow tracking="widest">GNSS constellation mask</Eyebrow>
      <HelperText class="mt-2">
        {#if gnssModeItem}
          {gnssModeItem.description ?? "Choose which constellations the vehicle should keep enabled. Each toggle stages a new bitmask in the shared review tray."}
        {:else}
          GPS_GNSS_MODE is unavailable for this scope.
        {/if}
      </HelperText>
      {#if gnssModeItem}
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.gpsCurrentPrefix}-GPS_GNSS_MODE`}>
          Current · {currentValueText(gnssModeItem)}
        </Eyebrow>
      {/if}
      {#if params.stagedEdits.GPS_GNSS_MODE}
        <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.gpsStagedPrefix}-GPS_GNSS_MODE`}>
          Queued · {params.stagedEdits.GPS_GNSS_MODE.nextValueText}
        </p>
      {/if}
    </div>

    {#if gnssItems.length > 0}
      <SetupBitmaskChecklist
        disabled={actionsBlocked || gnssModeItem?.readOnly === true}
        items={gnssItems.map((item) => ({
          key: item.key,
          label: item.label,
          checked: item.checked,
        }))}
        onToggle={(item) => toggleGnssBit(Number(item.key))}
        title="Available constellations"
      />
    {:else}
      <EmptyState title="GNSS metadata unavailable" description="GNSS metadata is incomplete for this scope, so the checklist stays read-only instead of inventing a bitmask editor." />
    {/if}
  </Card.Root>

  {#if recoveryReasons.length > 0}
    <Alert
      variant="warning"
      density="compact"
      shadow={false}
      title="Metadata recovery is active for GPS."
      testId={setupWorkspaceTestIds.gpsRecovery}
    >
      <p class="mt-2">Purpose-built editors stay visible but read-only until the missing parameter metadata is restored for this scope.</p>
    </Alert>
  {/if}
  {/snippet}
</SetupSectionShell>
