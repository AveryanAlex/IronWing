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
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupTelemetryCard from "../../../../features/setup/shared/SetupTelemetryCard.svelte";
import { resolveSetupDraftNumber } from "../../../../features/setup/shared/parameter-editing";
import {
  discoverIndexedSetupParamNumbers,
  indexedSetupParamRefs,
} from "../../../../features/setup/shared/setup-param-refs";
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
let selectedBattery = $state("1");
let lastScopedBatteryObservation = $state<BatteryLiveObservation | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let docsUrl = $derived(resolveDocsUrl("power_module_config"));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let batteryParamNames = $derived.by(() => [
  ...Object.keys(params.paramStore?.params ?? {}),
  ...Object.keys(params.stagedEdits),
]);
let availableBatteryNumbers = $derived(discoverIndexedSetupParamNumbers(batteryParamNames, "BATT"));
let selectedBatteryNumber = $derived.by(() => {
  const requested = Number(selectedBattery);
  if (Number.isInteger(requested) && availableBatteryNumbers.includes(requested)) {
    return requested;
  }

  return availableBatteryNumbers[0] ?? 1;
});
let selectedBatteryLabel = $derived(batteryLabel(selectedBatteryNumber));
let batterySelectorOptions = $derived.by(() => {
  const indexes = availableBatteryNumbers.length > 0 ? availableBatteryNumbers : [selectedBatteryNumber];
  return indexes.map((index) => ({
    value: String(index),
    label: availableBatteryNumbers.length > 0 ? batteryLabel(index) : "Battery 1 (waiting for parameters)",
  }));
});
let monitorParams = $derived(indexedSetupParamRefs("BATT", selectedBatteryNumber, ["MONITOR"]));
let calibrationParams = $derived(
  indexedSetupParamRefs("BATT", selectedBatteryNumber, ["VOLT_PIN", "CURR_PIN", "VOLT_MULT", "AMP_PERVLT"]),
);
let warningParams = $derived(indexedSetupParamRefs("BATT", selectedBatteryNumber, ["CAPACITY", "LOW_VOLT"]));
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
let monitorItem = $derived(itemIndex.get(batteryParamId("MONITOR")) ?? null);
let voltPinItem = $derived(itemIndex.get(batteryParamId("VOLT_PIN")) ?? null);
let currPinItem = $derived(itemIndex.get(batteryParamId("CURR_PIN")) ?? null);
let voltMultItem = $derived(itemIndex.get(batteryParamId("VOLT_MULT")) ?? null);
let ampPerVoltItem = $derived(itemIndex.get(batteryParamId("AMP_PERVLT")) ?? null);
let armVoltItem = $derived(itemIndex.get(batteryParamId("ARM_VOLT")) ?? null);
let lowVoltItem = $derived(itemIndex.get(batteryParamId("LOW_VOLT")) ?? null);
let crtVoltItem = $derived(itemIndex.get(batteryParamId("CRT_VOLT")) ?? null);
let monitorValue = $derived(
  resolveSetupDraftNumber(params.stagedEdits[batteryParamId("MONITOR")]?.nextValue ?? monitorItem?.value) ??
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
let chemistryPreviewEntries = $derived.by(() => {
  const index = Number(selectedChemistry);
  const cells = Math.max(1, Math.round(resolveSetupDraftNumber(batteryCellCount) ?? 4));
  const chemistry = validChemistries[index] ?? null;

  if (!chemistry) {
    return [];
  }

  return [
    {
      item: armVoltItem,
      name: batteryParamId("ARM_VOLT"),
      nextValue: round2(calcBattArmVolt(cells, chemistry.cellVoltMin)),
    },
    {
      item: lowVoltItem,
      name: batteryParamId("LOW_VOLT"),
      nextValue: round2(calcBattLowVolt(cells, chemistry.cellVoltMin)),
    },
    {
      item: crtVoltItem,
      name: batteryParamId("CRT_VOLT"),
      nextValue: round2(calcBattCrtVolt(cells, chemistry.cellVoltMin)),
    },
  ];
});
let chemistryRows = $derived(buildPreviewRows(chemistryPreviewEntries));
let boardPreviewEntries = $derived.by(() => {
  const preset = validBoardPresets[Number(selectedBoardPreset)] ?? null;
  if (!preset) {
    return [];
  }

  return [
    { item: voltPinItem, name: batteryParamId("VOLT_PIN"), nextValue: preset.voltPin },
    { item: currPinItem, name: batteryParamId("CURR_PIN"), nextValue: preset.currPin },
  ];
});
let boardRows = $derived(buildPreviewRows(boardPreviewEntries));
let sensorPreviewEntries = $derived.by(() => {
  const preset = validSensorPresets[Number(selectedSensorPreset)] ?? null;
  if (!preset) {
    return [];
  }

  return [
    { item: voltMultItem, name: batteryParamId("VOLT_MULT"), nextValue: round3(preset.voltMult) },
    { item: ampPerVoltItem, name: batteryParamId("AMP_PERVLT"), nextValue: round3(preset.ampPerVolt) },
  ];
});
let sensorRows = $derived(buildPreviewRows(sensorPreviewEntries));
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
      label: "Selected monitor",
      value: batteryEnabled ? "Enabled" : "Disabled",
      detail: presetStateText,
      tone: batteryEnabled ? ("success" as TelemetryTone) : ("neutral" as TelemetryTone),
      testId: setupWorkspaceTestIds.batteryPresetState,
    },
    {
      label: "Live voltage",
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

function batteryParamId(suffix: string, index = selectedBatteryNumber): string {
  return `BATT${index === 1 ? "" : index}_${suffix}`;
}

function batteryLabel(index: number): string {
  return index === 1 ? "Battery 1 (primary)" : `Battery ${index}`;
}

function selectBattery(event: Event) {
  selectedBattery = (event.currentTarget as HTMLSelectElement).value;
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
    title="Live battery telemetry"
    description="Latest vehicle voltage, current, remaining charge, and the selected configuration preset."
    statusText={liveSummary.stateText}
    statusTone={liveSummary.stateTone}
    statusTestId={setupWorkspaceTestIds.batteryLiveState}
    metrics={batteryTelemetryMetrics}
    columns={5}
    testId={setupWorkspaceTestIds.batterySummary}
  />

  <SetupSectionCard icon={BatteryCharging} title="Configuration target" description="Choose which discovered battery parameter family to configure. Live telemetry remains vehicle-wide." compact>
    <NativeSelect
      value={String(selectedBatteryNumber)}
      onchange={selectBattery}
      aria-label="Battery parameter family"
      disabled={actionsBlocked || availableBatteryNumbers.length <= 1}
      options={batterySelectorOptions}
      testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-battery`}
    />
  </SetupSectionCard>

  <SetupParamSection
    id={`battery-${selectedBatteryNumber}-monitor`}
    icon={BatteryCharging}
    title={`${selectedBatteryLabel} monitor`}
    description="Choose the monitor backend exposed by this battery parameter family."
    params={monitorParams}
    disabled={actionsBlocked}
    compact
    testIdPrefix="setup-workspace-battery"
  />

  <SetupSectionCard icon={BatteryCharging} title={`${selectedBatteryLabel} presets`} description="Preview known board, power-module, or chemistry values before staging them for the selected battery." compact>
    <SetupFieldStack divided>
      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage and current sense pins</Eyebrow>
          <HelperText class="mt-2">Choose a known flight-controller preset to preview {batteryParamId("VOLT_PIN")} and {batteryParamId("CURR_PIN")} before staging.</HelperText>
        </div>
        <div>
          <NativeSelect bind:value={selectedBoardPreset} disabled={actionsBlocked || validBoardPresets.length === 0} options={boardPresetOptions} testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-board`} />
          {#if boardRows.length > 0}
            <div class="mt-3" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-board`}>
              <SetupPreviewStagePanel
                onCancel={() => {
                  selectedBoardPreset = "";
                }}
                onStage={() => stagePreview(boardPreviewEntries)}
                rows={boardRows}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage multiplier and amps-per-volt</Eyebrow>
          <HelperText class="mt-2">Choose a known power-module scaling preset to preview {batteryParamId("VOLT_MULT")} and {batteryParamId("AMP_PERVLT")}.</HelperText>
        </div>
        <div>
          <NativeSelect bind:value={selectedSensorPreset} disabled={actionsBlocked || validSensorPresets.length === 0} options={sensorPresetOptions} testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-sensor`} />
          {#if sensorRows.length > 0}
            <div class="mt-3" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-sensor`}>
              <SetupPreviewStagePanel
                onCancel={() => {
                  selectedSensorPreset = "";
                }}
                onStage={() => stagePreview(sensorPreviewEntries)}
                rows={sensorRows}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="grid gap-3 pt-3 first:pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,28rem)] xl:items-start">
        <div>
          <Eyebrow tracking="widest">Voltage-threshold preview</Eyebrow>
          <HelperText class="mt-2">Choose a chemistry and cell count to preview {batteryParamId("ARM_VOLT")}, {batteryParamId("LOW_VOLT")}, and {batteryParamId("CRT_VOLT")}.</HelperText>
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
                onStage={() => stagePreview(chemistryPreviewEntries)}
                rows={chemistryRows}
              />
            </div>
          {/if}
        </div>
      </div>
    </SetupFieldStack>
  </SetupSectionCard>

  <SetupParamSection
    id={`battery-${selectedBatteryNumber}-calibration`}
    icon={Gauge}
    title={`${selectedBatteryLabel} manual sensor calibration`}
    description="Use these fields when presets do not match the installed power module or wiring."
    params={calibrationParams}
    disabled={actionsBlocked}
    compact
    testIdPrefix="setup-workspace-battery"
  />

  <SetupParamSection
    id={`battery-${selectedBatteryNumber}-warnings`}
    icon={BatteryWarning}
    title={`${selectedBatteryLabel} capacity and voltage warnings`}
    description="Set pack capacity and manual low-voltage thresholds when chemistry presets need adjustment."
    params={warningParams}
    disabled={actionsBlocked}
    compact
    testIdPrefix="setup-workspace-battery"
  />
  {/snippet}
</SetupSectionShell>
