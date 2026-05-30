<script lang="ts">
import { BatteryCharging, BatteryWarning, Gauge } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import {
  BATTERY_CHEMISTRIES,
  BOARD_PRESETS,
  SENSOR_PRESETS,
  calcBattArmVolt,
  calcBattCrtVolt,
  calcBattLowVolt,
} from "../../../../data/battery-presets";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { selectTelemetryView } from "../../../../lib/telemetry-selectors";
import { Eyebrow, HelperText, Input, NativeSelect } from "../../../../components/ui";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupTelemetryCard from "../../../../features/setup/shared/SetupTelemetryCard.svelte";
import {
  resolveSetupDraftNumber,
  resolveSetupEnumOptions,
  stageSetupParameterEdit,
} from "../../../../features/setup/shared/parameter-editing";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "battery_monitor"));

type TelemetryTone = "neutral" | "info" | "success" | "warning" | "danger";
type BatteryLiveObservation = {
  scopeKey: string;
  voltage: number | null;
  current: number | null;
  remaining: number | null;
  cellCount: number | null;
  partial: boolean;
};

type PresetRowInput = {
  item: ParameterItemModel | null;
  name: string;
  nextValue: number;
};

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let selectedBoardPreset = $state<string>("");
let selectedSensorPreset = $state<string>("");
let selectedChemistry = $state<string>("");
let batteryCellCount = $state("4");
let lastScopedBatteryObservation = $state<BatteryLiveObservation | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let docsUrl = $derived(resolveDocsUrl("power_module_config"));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let validBoardPresets = $derived(
  BOARD_PRESETS.filter(
    (preset) => preset.label.trim().length > 0 && Number.isFinite(preset.voltPin) && Number.isFinite(preset.currPin),
  ),
);
let validSensorPresets = $derived(
  SENSOR_PRESETS.filter(
    (preset) =>
      preset.label.trim().length > 0 && Number.isFinite(preset.voltMult) && Number.isFinite(preset.ampPerVolt),
  ),
);
let validChemistries = $derived(
  BATTERY_CHEMISTRIES.filter(
    (chemistry) =>
      chemistry.label.trim().length > 0 &&
      Number.isFinite(chemistry.cellVoltMax) &&
      Number.isFinite(chemistry.cellVoltMin),
  ),
);
let boardPresetOptions = $derived([
  { value: "", label: "Select board preset" },
  ...validBoardPresets.map((preset, index) => ({ value: String(index), label: preset.label })),
]);
let sensorPresetOptions = $derived([
  { value: "", label: "Select sensor preset" },
  ...validSensorPresets.map((preset, index) => ({ value: String(index), label: preset.label })),
]);
let chemistryPresetOptions = $derived([
  { value: "", label: "Select chemistry" },
  ...validChemistries.map((chemistry, index) => ({ value: String(index), label: chemistry.label })),
]);
let monitorItem = $derived(itemIndex.get("BATT_MONITOR") ?? null);
let voltPinItem = $derived(itemIndex.get("BATT_VOLT_PIN") ?? null);
let currPinItem = $derived(itemIndex.get("BATT_CURR_PIN") ?? null);
let voltMultItem = $derived(itemIndex.get("BATT_VOLT_MULT") ?? null);
let ampPerVoltItem = $derived(itemIndex.get("BATT_AMP_PERVLT") ?? null);
let capacityItem = $derived(itemIndex.get("BATT_CAPACITY") ?? null);
let armVoltItem = $derived(itemIndex.get("BATT_ARM_VOLT") ?? null);
let lowVoltItem = $derived(itemIndex.get("BATT_LOW_VOLT") ?? null);
let crtVoltItem = $derived(itemIndex.get("BATT_CRT_VOLT") ?? null);
let secondMonitorItem = $derived(itemIndex.get("BATT2_MONITOR") ?? null);
let monitorOptions = $derived(resolveSetupEnumOptions(params.metadata?.get("BATT_MONITOR")?.values));
let secondMonitorOptions = $derived(resolveSetupEnumOptions(params.metadata?.get("BATT2_MONITOR")?.values));
let monitorValue = $derived(
  resolveSetupDraftNumber(params.stagedEdits.BATT_MONITOR?.nextValue ?? monitorItem?.value) ??
    monitorItem?.value ??
    null,
);
let batteryEnabled = $derived(monitorValue !== null && monitorValue > 0);
let activeBoardPresetLabel = $derived(
  resolveBoardPresetLabel(validBoardPresets, params.stagedEdits, voltPinItem, currPinItem),
);
let activeSensorPresetLabel = $derived(
  resolveSensorPresetLabel(validSensorPresets, params.stagedEdits, voltMultItem, ampPerVoltItem),
);
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
    lastScopedBatteryObservation &&
    lastScopedBatteryObservation.scopeKey === view.activeScopeKey &&
    (!liveConnected || session.telemetryDomain.complete === false)
  ) {
    return {
      stateText: "Last update",
      stateTone: "warning" as TelemetryTone,
      stale: true,
      observation: lastScopedBatteryObservation,
    };
  }

  return {
    stateText: "No telemetry",
    stateTone: "neutral" as TelemetryTone,
    stale: false,
    observation: null,
  };
});
let secondBatteryVisible = $derived(byPrefixExists(params.paramStore, params.stagedEdits, "BATT2_"));
let chemistryRows = $derived.by(() => {
  const index = Number(selectedChemistry);
  const cells = Math.max(1, Math.round(resolveSetupDraftNumber(batteryCellCount) ?? 4));
  const chemistry = validChemistries[index] ?? null;

  if (!chemistry) {
    return [];
  }

  return buildPreviewRows([
    { item: armVoltItem, name: "BATT_ARM_VOLT", nextValue: round2(calcBattArmVolt(cells, chemistry.cellVoltMin)) },
    { item: lowVoltItem, name: "BATT_LOW_VOLT", nextValue: round2(calcBattLowVolt(cells, chemistry.cellVoltMin)) },
    { item: crtVoltItem, name: "BATT_CRT_VOLT", nextValue: round2(calcBattCrtVolt(cells, chemistry.cellVoltMin)) },
  ]);
});
let boardRows = $derived.by(() => {
  const preset = validBoardPresets[Number(selectedBoardPreset)] ?? null;
  if (!preset) {
    return [];
  }

  return buildPreviewRows([
    { item: voltPinItem, name: "BATT_VOLT_PIN", nextValue: preset.voltPin },
    { item: currPinItem, name: "BATT_CURR_PIN", nextValue: preset.currPin },
  ]);
});
let sensorRows = $derived.by(() => {
  const preset = validSensorPresets[Number(selectedSensorPreset)] ?? null;
  if (!preset) {
    return [];
  }

  return buildPreviewRows([
    { item: voltMultItem, name: "BATT_VOLT_MULT", nextValue: round3(preset.voltMult) },
    { item: ampPerVoltItem, name: "BATT_AMP_PERVLT", nextValue: round3(preset.ampPerVolt) },
  ]);
});
let presetStateText = $derived.by(() => {
  const parts: string[] = [];
  if (activeBoardPresetLabel) {
    parts.push(`Board · ${activeBoardPresetLabel}`);
  }
  if (activeSensorPresetLabel) {
    parts.push(`Sensor · ${activeSensorPresetLabel}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Custom manual staging";
});
let batteryTelemetryMetrics = $derived.by(() => {
  const observation = liveSummary.observation;

  return [
    {
      label: "Monitor",
      value: batteryEnabled ? "Enabled" : "Disabled",
      detail: presetStateText,
      tone: batteryEnabled ? ("success" as TelemetryTone) : ("neutral" as TelemetryTone),
      testId: setupWorkspaceTestIds.batteryPresetState,
    },
    {
      label: "Voltage",
      value: observation ? formatVoltage(observation.voltage) : "—",
      mono: true,
      stale: liveSummary.stale,
      unavailable: observation?.voltage === null || observation === null,
      testId: setupWorkspaceTestIds.batteryLiveDetail,
    },
    {
      label: "Current",
      value: observation ? formatCurrent(observation.current) : "—",
      mono: true,
      stale: liveSummary.stale,
      unavailable: observation?.current === null || observation === null,
    },
    {
      label: "Remaining",
      value: observation ? formatRemaining(observation.remaining) : "—",
      stale: liveSummary.stale,
      unavailable: observation?.remaining === null || observation === null,
    },
    {
      label: "Cells",
      value: observation?.cellCount === null || observation === null ? "—" : String(observation.cellCount),
      mono: true,
      stale: liveSummary.stale,
      unavailable: observation?.cellCount === null || observation === null,
    },
  ];
});

$effect(() => {
  if (liveObservation && view.activeScopeKey) {
    lastScopedBatteryObservation = liveObservation;
  }
});

function stage(item: ParameterItemModel | null, draftValue: unknown, requireOptions = false, optionsCount = 0) {
  stageSetupParameterEdit(paramsStore, item, draftValue, {
    actionsBlocked,
    optionsReady: !requireOptions || optionsCount > 0,
  });
}

function unstage(name: string) {
  paramsStore.discardStagedEdit(name);
}

function byPrefixExists(
  paramStore: typeof params.paramStore,
  stagedEdits: typeof params.stagedEdits,
  prefix: string,
): boolean {
  return (
    Object.keys(paramStore?.params ?? {}).some((name) => name.startsWith(prefix)) ||
    Object.keys(stagedEdits).some((name) => name.startsWith(prefix))
  );
}

function resolveCurrentNumericValue(
  item: ParameterItemModel | null,
  stagedEdits: typeof params.stagedEdits,
): number | null {
  if (!item) {
    return null;
  }

  const stagedValue = stagedEdits[item.name]?.nextValue;
  return typeof stagedValue === "number" ? stagedValue : item.value;
}

function resolveBoardPresetLabel(
  presets: typeof BOARD_PRESETS,
  stagedEdits: typeof params.stagedEdits,
  currentVoltPin: ParameterItemModel | null,
  currentCurrPin: ParameterItemModel | null,
): string | null {
  const voltPin = resolveCurrentNumericValue(currentVoltPin, stagedEdits);
  const currPin = resolveCurrentNumericValue(currentCurrPin, stagedEdits);
  const preset = presets.find((entry) => entry.voltPin === voltPin && entry.currPin === currPin);
  return preset?.label ?? null;
}

function resolveSensorPresetLabel(
  presets: typeof SENSOR_PRESETS,
  stagedEdits: typeof params.stagedEdits,
  currentVoltMult: ParameterItemModel | null,
  currentAmpPerVolt: ParameterItemModel | null,
): string | null {
  const voltMult = resolveCurrentNumericValue(currentVoltMult, stagedEdits);
  const ampPerVolt = resolveCurrentNumericValue(currentAmpPerVolt, stagedEdits);
  const preset = presets.find(
    (entry) =>
      voltMult !== null &&
      ampPerVolt !== null &&
      Math.abs(entry.voltMult - voltMult) < 0.01 &&
      Math.abs(entry.ampPerVolt - ampPerVolt) < 0.01,
  );
  return preset?.label ?? null;
}

function buildPreviewRows(entries: PresetRowInput[]) {
  return entries.map((entry) => {
    const item = entry.item;
    const currentValue = item ? resolveCurrentNumericValue(item, params.stagedEdits) : null;
    const willChange = item !== null && currentValue !== entry.nextValue;

    return {
      key: entry.name,
      label: item?.label ?? entry.name,
      paramName: entry.name,
      detail:
        item === null
          ? "Unavailable in this firmware"
          : `${currentValue === null ? "--" : currentValue} → ${entry.nextValue}`,
      willChange,
    };
  });
}

function stagePreview(entries: PresetRowInput[]) {
  if (actionsBlocked) {
    return;
  }

  for (const entry of entries) {
    if (!entry.item || entry.item.readOnly === true) {
      continue;
    }

    const currentValue = resolveCurrentNumericValue(entry.item, params.stagedEdits);
    if (currentValue === entry.nextValue) {
      continue;
    }

    paramsStore.stageParameterEdit(entry.item, entry.nextValue);
  }
}

function resolveLiveObservation(
  telemetryView: ReturnType<typeof selectTelemetryView>,
  scopeKey: string | null,
): BatteryLiveObservation | null {
  if (!scopeKey) {
    return null;
  }

  const voltage =
    typeof telemetryView.battery_voltage_v === "number" && Number.isFinite(telemetryView.battery_voltage_v)
      ? telemetryView.battery_voltage_v
      : null;
  const current =
    typeof telemetryView.battery_current_a === "number" && Number.isFinite(telemetryView.battery_current_a)
      ? telemetryView.battery_current_a
      : null;
  const remaining =
    typeof telemetryView.battery_pct === "number" && Number.isFinite(telemetryView.battery_pct)
      ? telemetryView.battery_pct
      : null;
  const cellCount = Array.isArray(telemetryView.battery_voltage_cells)
    ? telemetryView.battery_voltage_cells.length
    : null;

  if (voltage === null && current === null && remaining === null && cellCount === null) {
    return null;
  }

  return {
    scopeKey,
    voltage,
    current,
    remaining,
    cellCount,
    partial: voltage === null || current === null || remaining === null,
  };
}

function formatVoltage(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(2)} V`;
}

function formatCurrent(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(1)} A`;
}

function formatRemaining(value: number | null): string {
  return value === null ? "--" : `${Math.round(value)}%`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Configure battery monitor presets and manual calibration"
  description="Choose battery monitor type, board pins, sensor scaling, capacity, and voltage thresholds. Presets preview their parameter changes before staging, and manual calibration remains available when the firmware exposes the matching settings."
  testId={setupWorkspaceTestIds.batterySection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.batteryDocsLink }]}
>
  {#snippet body()}
  <SetupTelemetryCard
    icon={BatteryCharging}
    title="Current battery"
    description="Latest voltage, current, remaining charge, and active monitor preset."
    statusText={liveSummary.stateText}
    statusTone={liveSummary.stateTone}
    statusTestId={setupWorkspaceTestIds.batteryLiveState}
    metrics={batteryTelemetryMetrics}
    columns={5}
    testId={setupWorkspaceTestIds.batterySummary}
  />

  <SetupSectionCard icon={BatteryCharging} title="Monitor and presets" description="Choose the battery monitor type, then use presets when the flight-controller board, power module, or battery chemistry is known." compact>
    <SetupFieldStack divided>
      {#if monitorItem}
        <SetupParamEditCard
          item={monitorItem}
          inputId="setup-battery-monitor"
          label={monitorItem.label}
          description={monitorItem.description ?? "Choose the primary battery monitor backend."}
          type="enum"
          value={params.stagedEdits.BATT_MONITOR?.nextValue ?? monitorItem.value}
          options={monitorOptions}
          stagedName={params.stagedEdits.BATT_MONITOR ? monitorItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_MONITOR`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value !== "boolean" && stage(monitorItem, value, true, monitorOptions.length)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_MONITOR`}
          disabled={actionsBlocked || monitorOptions.length === 0}
        />
      {/if}

      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage and current sense pins</Eyebrow>
          <HelperText class="mt-2">Choose a known flight-controller preset to preview BATT_VOLT_PIN and BATT_CURR_PIN before staging.</HelperText>
        </div>
        <div>
          <NativeSelect bind:value={selectedBoardPreset} disabled={actionsBlocked || validBoardPresets.length === 0} options={boardPresetOptions} testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-board`} />
          {#if boardRows.length > 0}
            <div class="mt-3" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-board`}>
              <SetupPreviewStagePanel
                onCancel={() => {
                  selectedBoardPreset = "";
                }}
                onStage={() => stagePreview([
                  { item: voltPinItem, name: "BATT_VOLT_PIN", nextValue: validBoardPresets[Number(selectedBoardPreset)]?.voltPin ?? 0 },
                  { item: currPinItem, name: "BATT_CURR_PIN", nextValue: validBoardPresets[Number(selectedBoardPreset)]?.currPin ?? 0 },
                ])}
                rows={boardRows}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage multiplier and amps-per-volt</Eyebrow>
          <HelperText class="mt-2">Choose a known power-module scaling preset to preview BATT_VOLT_MULT and BATT_AMP_PERVLT.</HelperText>
        </div>
        <div>
          <NativeSelect bind:value={selectedSensorPreset} disabled={actionsBlocked || validSensorPresets.length === 0} options={sensorPresetOptions} testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-sensor`} />
          {#if sensorRows.length > 0}
            <div class="mt-3" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-sensor`}>
              <SetupPreviewStagePanel
                onCancel={() => {
                  selectedSensorPreset = "";
                }}
                onStage={() => stagePreview([
                  { item: voltMultItem, name: "BATT_VOLT_MULT", nextValue: round3(validSensorPresets[Number(selectedSensorPreset)]?.voltMult ?? 0) },
                  { item: ampPerVoltItem, name: "BATT_AMP_PERVLT", nextValue: round3(validSensorPresets[Number(selectedSensorPreset)]?.ampPerVolt ?? 0) },
                ])}
                rows={sensorRows}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage-threshold preview</Eyebrow>
          <HelperText class="mt-2">Choose a chemistry and cell count to preview BATT_ARM_VOLT, BATT_LOW_VOLT, and BATT_CRT_VOLT.</HelperText>
        </div>
        <div>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <NativeSelect bind:value={selectedChemistry} disabled={actionsBlocked || validChemistries.length === 0} options={chemistryPresetOptions} testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-chemistry`} />
            <Input bind:value={batteryCellCount} inputmode="numeric" min="1" step="1" type="number" />
          </div>
          {#if chemistryRows.length > 0}
            <div class="mt-3" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-chemistry`}>
              <SetupPreviewStagePanel
                onCancel={() => {
                  selectedChemistry = "";
                }}
                onStage={() => {
                  const chemistry = validChemistries[Number(selectedChemistry)] ?? null;
                  const cells = Math.max(1, Math.round(resolveSetupDraftNumber(batteryCellCount) ?? 4));
                  if (!chemistry) {
                    return;
                  }
                  stagePreview([
                    { item: armVoltItem, name: "BATT_ARM_VOLT", nextValue: round2(calcBattArmVolt(cells, chemistry.cellVoltMin)) },
                    { item: lowVoltItem, name: "BATT_LOW_VOLT", nextValue: round2(calcBattLowVolt(cells, chemistry.cellVoltMin)) },
                    { item: crtVoltItem, name: "BATT_CRT_VOLT", nextValue: round2(calcBattCrtVolt(cells, chemistry.cellVoltMin)) },
                  ]);
                }}
                rows={chemistryRows}
              />
            </div>
          {/if}
        </div>
      </div>
    </SetupFieldStack>
  </SetupSectionCard>

  <SetupSectionCard icon={Gauge} title="Manual sensor calibration" description="Use these fields when presets do not match the installed power module or wiring." compact>
    <SetupParamEditGrid>
      {#if voltPinItem}
        <SetupParamEditCard
          item={voltPinItem}
          inputId="setup-battery-volt-pin"
          label={voltPinItem.label}
          description="Voltage sense pin used by the board or power module."
          value={params.stagedEdits.BATT_VOLT_PIN?.nextValue ?? voltPinItem.value}
          stagedName={params.stagedEdits.BATT_VOLT_PIN ? voltPinItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_VOLT_PIN`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(voltPinItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_VOLT_PIN`}
          disabled={actionsBlocked}
          step={1}
        />
      {/if}

      {#if currPinItem}
        <SetupParamEditCard
          item={currPinItem}
          inputId="setup-battery-curr-pin"
          label={currPinItem.label}
          description="Current sense pin used by the board or power module."
          value={params.stagedEdits.BATT_CURR_PIN?.nextValue ?? currPinItem.value}
          stagedName={params.stagedEdits.BATT_CURR_PIN ? currPinItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_CURR_PIN`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(currPinItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_CURR_PIN`}
          disabled={actionsBlocked}
          step={1}
        />
      {/if}

      {#if voltMultItem}
        <SetupParamEditCard
          item={voltMultItem}
          inputId="setup-battery-volt-mult"
          label={voltMultItem.label}
          description="Voltage multiplier used to convert sensor output to pack voltage."
          value={params.stagedEdits.BATT_VOLT_MULT?.nextValue ?? voltMultItem.value}
          stagedName={params.stagedEdits.BATT_VOLT_MULT ? voltMultItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_VOLT_MULT`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(voltMultItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_VOLT_MULT`}
          disabled={actionsBlocked}
          step={0.01}
        />
      {/if}

      {#if ampPerVoltItem}
        <SetupParamEditCard
          item={ampPerVoltItem}
          inputId="setup-battery-amp-per-volt"
          label={ampPerVoltItem.label}
          description="Current scaling used to convert sensor output to amps."
          value={params.stagedEdits.BATT_AMP_PERVLT?.nextValue ?? ampPerVoltItem.value}
          stagedName={params.stagedEdits.BATT_AMP_PERVLT ? ampPerVoltItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_AMP_PERVLT`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(ampPerVoltItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_AMP_PERVLT`}
          disabled={actionsBlocked}
          step={0.01}
        />
      {/if}
    </SetupParamEditGrid>
  </SetupSectionCard>

  <SetupSectionCard icon={BatteryWarning} title="Capacity and voltage warnings" description="Set pack capacity and manual low-voltage thresholds when chemistry presets need adjustment." compact>
    <SetupParamEditGrid>
      {#if capacityItem}
        <SetupParamEditCard
          item={capacityItem}
          inputId="setup-battery-capacity"
          label={capacityItem.label}
          description="Usable pack capacity for remaining-charge estimates and battery failsafe behavior."
          value={params.stagedEdits.BATT_CAPACITY?.nextValue ?? capacityItem.value}
          stagedName={params.stagedEdits.BATT_CAPACITY ? capacityItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_CAPACITY`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(capacityItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_CAPACITY`}
          disabled={actionsBlocked}
          step={100}
        />
      {/if}

      {#if lowVoltItem}
        <SetupParamEditCard
          item={lowVoltItem}
          inputId="setup-battery-low-volt"
          label={lowVoltItem.label}
          description="Manual low-voltage threshold for battery warnings or failsafe behavior."
          value={params.stagedEdits.BATT_LOW_VOLT?.nextValue ?? lowVoltItem.value}
          stagedName={params.stagedEdits.BATT_LOW_VOLT ? lowVoltItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_LOW_VOLT`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value === "number" && stage(lowVoltItem, value)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_LOW_VOLT`}
          disabled={actionsBlocked}
          step={0.1}
        />
      {/if}
    </SetupParamEditGrid>
  </SetupSectionCard>

  {#if secondBatteryVisible}
    <SetupSectionCard icon={BatteryCharging} title="Optional secondary monitor" description="Secondary battery monitor settings are shown when this firmware exposes BATT2_* parameters." surface="elevated" compact>
      {#if secondMonitorItem}
        <SetupParamEditCard
          item={secondMonitorItem}
          inputId="setup-battery-secondary-monitor"
          label={secondMonitorItem.label}
          description="Choose the secondary battery monitor backend when this firmware exposes BATT2_* parameters."
          type="enum"
          value={params.stagedEdits.BATT2_MONITOR?.nextValue ?? secondMonitorItem.value}
          options={secondMonitorOptions}
          stagedName={params.stagedEdits.BATT2_MONITOR ? secondMonitorItem.name : undefined}
          stagedTestId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT2_MONITOR`}
          onUnstage={unstage}
          onValueChange={(value) => typeof value !== "boolean" && stage(secondMonitorItem, value, true, secondMonitorOptions.length)}
          inputTestId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT2_MONITOR`}
          disabled={actionsBlocked || secondMonitorOptions.length === 0}
        />
      {:else}
        <HelperText class="mt-3" tone="warning">Battery 2 settings are only partially available for this firmware.</HelperText>
      {/if}
    </SetupSectionCard>
  {/if}
  {/snippet}
</SetupSectionShell>
