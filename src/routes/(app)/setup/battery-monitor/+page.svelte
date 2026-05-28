<script lang="ts">
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
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { selectTelemetryView } from "../../../../lib/telemetry-selectors";
import {
  Alert,
  Card,
  Eyebrow,
  HelperText,
  Input,
  NativeSelect,
  StagedBadge as SetupStagedBadge,
} from "../../../../components/ui";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import SetupParamEnumControl from "../../../../features/setup/shared/SetupParamEnumControl.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "battery_monitor"));

type EnumOption = { code: number; label: string };
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
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
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
let monitorOptions = $derived(resolveEnumOptions(params.metadata?.get("BATT_MONITOR")?.values));
let secondMonitorOptions = $derived(resolveEnumOptions(params.metadata?.get("BATT2_MONITOR")?.values));
let monitorDraft = $derived(String(params.stagedEdits.BATT_MONITOR?.nextValue ?? monitorItem?.value ?? ""));
let secondMonitorDraft = $derived(
  String(params.stagedEdits.BATT2_MONITOR?.nextValue ?? secondMonitorItem?.value ?? ""),
);
let voltPinDraft = $derived(String(params.stagedEdits.BATT_VOLT_PIN?.nextValue ?? voltPinItem?.value ?? ""));
let currPinDraft = $derived(String(params.stagedEdits.BATT_CURR_PIN?.nextValue ?? currPinItem?.value ?? ""));
let voltMultDraft = $derived(String(params.stagedEdits.BATT_VOLT_MULT?.nextValue ?? voltMultItem?.value ?? ""));
let ampPerVoltDraft = $derived(String(params.stagedEdits.BATT_AMP_PERVLT?.nextValue ?? ampPerVoltItem?.value ?? ""));
let capacityDraft = $derived(String(params.stagedEdits.BATT_CAPACITY?.nextValue ?? capacityItem?.value ?? ""));
let armVoltDraft = $derived(String(params.stagedEdits.BATT_ARM_VOLT?.nextValue ?? armVoltItem?.value ?? ""));
let lowVoltDraft = $derived(String(params.stagedEdits.BATT_LOW_VOLT?.nextValue ?? lowVoltItem?.value ?? ""));
let crtVoltDraft = $derived(String(params.stagedEdits.BATT_CRT_VOLT?.nextValue ?? crtVoltItem?.value ?? ""));
let monitorValue = $derived(resolveDraftNumber(monitorDraft) ?? monitorItem?.value ?? null);
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
      stateText: liveObservation.partial ? "Live, partial" : "Live",
      detailText: liveObservation.partial
        ? "Battery telemetry is partially populated, so the section keeps the last truthful values visible without claiming a complete monitor state."
        : "Voltage, current, and remaining battery telemetry are live for this scope.",
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
      stateText: "Stale, same scope",
      detailText: "Last same-scope battery telemetry is retained while the link or telemetry stream settles.",
      observation: lastScopedBatteryObservation,
    };
  }

  return {
    stateText: section.availability === "blocked" ? "Blocked / unknown" : "Waiting for battery telemetry",
    detailText:
      section.availability === "blocked"
        ? "The section stays inspectable, but battery editors are blocked until the live scope and metadata recover."
        : "Connect a live vehicle to inspect truthful power telemetry before finalizing monitor settings.",
    observation: null,
  };
});
let secondBatteryVisible = $derived(byPrefixExists(params.paramStore, params.stagedEdits, "BATT2_"));
let secondBatteryPartial = $derived(secondBatteryVisible && !secondMonitorItem);
let recoveryReasons = $derived.by(() => {
  const reasons: string[] = [];

  if (!monitorItem) {
    reasons.push("BATT_MONITOR is unavailable in the current parameter store.");
  } else if (monitorOptions.length === 0) {
    reasons.push("BATT_MONITOR metadata is missing or malformed, so the monitor-type selector stays read-only.");
  }

  if (!voltPinItem) {
    reasons.push("BATT_VOLT_PIN is unavailable, so board-pin presets cannot be proven for this scope.");
  }

  if (!currPinItem) {
    reasons.push("BATT_CURR_PIN is unavailable, so board-pin presets cannot be proven for this scope.");
  }

  if (!voltMultItem || !ampPerVoltItem) {
    reasons.push(
      "BATT_VOLT_MULT or BATT_AMP_PERVLT is unavailable, so sensor-scaling presets cannot be staged truthfully.",
    );
  }

  if (!armVoltItem || !lowVoltItem || !crtVoltItem) {
    reasons.push("Battery threshold rows are incomplete, so chemistry presets stay advisory only.");
  }

  if (secondBatteryPartial) {
    reasons.push(
      "Battery 2 parameters are only partially present, so the secondary monitor stays summary-only instead of guessing the missing rows.",
    );
  }

  return reasons;
});
let chemistryRows = $derived.by(() => {
  const index = Number(selectedChemistry);
  const cells = Math.max(1, Math.round(resolveDraftNumber(batteryCellCount) ?? 4));
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

$effect(() => {
  if (liveObservation && view.activeScopeKey) {
    lastScopedBatteryObservation = liveObservation;
  }
});

function resolveEnumOptions(values: { code: number; label: string }[] | undefined): EnumOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveDraftNumber(value: unknown): number | null {
  const normalized = typeof value === "string" ? value : value == null ? "" : String(value);
  if (normalized.trim().length === 0) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function stage(item: ParameterItemModel | null, draftValue: string, requireOptions = false, optionsCount = 0) {
  const nextValue = resolveDraftNumber(draftValue);
  if (!item || nextValue === null || actionsBlocked || (requireOptions && optionsCount === 0)) {
    return;
  }

  paramsStore.stageParameterEdit(item, nextValue);
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
          ? "Unavailable on this scope"
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
  title="Preset-first battery monitor staging with truthful live power state"
  description="Board pins, sensor scaling, and voltage-threshold presets stay explicit here, but they still queue through the shared review tray. Manual numeric staging remains available whenever the scoped parameter family is complete enough to prove the affected rows."
  testId={setupWorkspaceTestIds.batterySection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.batteryDocsLink }]}
>
  {#snippet body()}
      <Card.Root
        density="compact"
        gap="compact"
        class="grid md:grid-cols-3"
        surface="elevated"
        testId={setupWorkspaceTestIds.batterySummary}
      >
    <div>
      <Eyebrow tracking="widest">Live battery state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.batteryLiveState}>
        {liveSummary.stateText}
      </p>
      <HelperText class="mt-1" testId={setupWorkspaceTestIds.batteryLiveDetail}>
        {liveSummary.detailText}
      </HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Preset state</Eyebrow>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.batteryPresetState}>
        {presetStateText}
      </p>
      <HelperText class="mt-1">
        {batteryEnabled ? "Battery monitor is enabled for this scope." : "Battery monitor is not enabled yet for this scope."}
      </HelperText>
    </div>
    <div>
      <Eyebrow tracking="widest">Power snapshot</Eyebrow>
      {#if liveSummary.observation}
        <p class="mt-2 text-sm font-semibold text-text-primary">
          {formatVoltage(liveSummary.observation.voltage)} · {formatCurrent(liveSummary.observation.current)}
        </p>
        <HelperText class="mt-1">
          Remaining {formatRemaining(liveSummary.observation.remaining)} · Cells {liveSummary.observation.cellCount ?? "--"}
        </HelperText>
      {:else}
        <HelperText class="mt-2">No scoped power sample yet.</HelperText>
      {/if}
    </div>
  </Card.Root>

  <div class="grid gap-3 xl:grid-cols-3">
    <Card.Root as="article" density="compact" surface="elevated">
      <Eyebrow tracking="widest">Board preset</Eyebrow>
      <h4 class="mt-2 text-base font-semibold text-text-primary">Voltage and current sense pins</h4>
      <HelperText class="mt-2">Choose a known flight-controller preset to preview BATT_VOLT_PIN and BATT_CURR_PIN before staging.</HelperText>
      <NativeSelect
        bind:value={selectedBoardPreset}
        class="mt-4"
        disabled={actionsBlocked || validBoardPresets.length === 0}
        options={boardPresetOptions}
        testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-board`}
      />
      {#if boardRows.length > 0}
        <div class="mt-4" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-board`}>
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
    </Card.Root>

    <Card.Root as="article" density="compact" surface="elevated">
      <Eyebrow tracking="widest">Sensor preset</Eyebrow>
      <h4 class="mt-2 text-base font-semibold text-text-primary">Voltage multiplier and amps-per-volt</h4>
      <HelperText class="mt-2">Choose a known power-module scaling preset to preview BATT_VOLT_MULT and BATT_AMP_PERVLT.</HelperText>
      <NativeSelect
        bind:value={selectedSensorPreset}
        class="mt-4"
        disabled={actionsBlocked || validSensorPresets.length === 0}
        options={sensorPresetOptions}
        testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-sensor`}
      />
      {#if sensorRows.length > 0}
        <div class="mt-4" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-sensor`}>
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
    </Card.Root>

    <Card.Root as="article" density="compact" surface="elevated">
      <Eyebrow tracking="widest">Chemistry preset</Eyebrow>
      <h4 class="mt-2 text-base font-semibold text-text-primary">Voltage-threshold preview</h4>
      <HelperText class="mt-2">Choose a chemistry and cell count to preview BATT_ARM_VOLT, BATT_LOW_VOLT, and BATT_CRT_VOLT.</HelperText>
      <div class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <NativeSelect
          bind:value={selectedChemistry}
          disabled={actionsBlocked || validChemistries.length === 0}
          options={chemistryPresetOptions}
          testId={`${setupWorkspaceTestIds.batteryPresetSelectPrefix}-chemistry`}
        />
        <Input
          bind:value={batteryCellCount}
          inputmode="numeric"
          min="1"
          step="1"
          type="number"
        />
      </div>
      {#if chemistryRows.length > 0}
        <div class="mt-4" data-testid={`${setupWorkspaceTestIds.batteryPreviewPrefix}-chemistry`}>
          <SetupPreviewStagePanel
            onCancel={() => {
              selectedChemistry = "";
            }}
            onStage={() => {
              const chemistry = validChemistries[Number(selectedChemistry)] ?? null;
              const cells = Math.max(1, Math.round(resolveDraftNumber(batteryCellCount) ?? 4));
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
    </Card.Root>
  </div>

  <div class="grid gap-3 xl:grid-cols-3">
    {#if monitorItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{monitorItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">{monitorItem.description ?? "Choose the primary battery-monitor backend without bypassing the shared review tray."}</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_MONITOR`}>
          Current · {currentValueText(monitorItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_MONITOR}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_MONITOR" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_MONITOR`} />
          </p>
        {/if}
        <div class="mt-4">
          <SetupParamEnumControl
            disabled={actionsBlocked || monitorOptions.length === 0}
            id="setup-battery-monitor"
            onChange={(value) => stage(monitorItem, value, true, monitorOptions.length)}
            options={monitorOptions}
            testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_MONITOR`}
            value={monitorDraft}
          />
        </div>
      </Card.Root>
    {/if}

    {#if voltPinItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{voltPinItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">Manual voltage-pin staging remains available when board presets do not fit the current wiring.</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_VOLT_PIN`}>
          Current · {currentValueText(voltPinItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_VOLT_PIN}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_VOLT_PIN" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_VOLT_PIN`} />
          </p>
        {/if}
        <Input
          bind:value={voltPinDraft}
          class="mt-4"
          inputmode="numeric"
          onchange={(event) => stage(voltPinItem, (event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => stage(voltPinItem, (event.currentTarget as HTMLInputElement).value)}
          step="1"
          testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_VOLT_PIN`}
          type="number"
        />
      </Card.Root>
    {/if}

    {#if voltMultItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{voltMultItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">Manual scaling remains available if the current sensor is not covered by the validated preset list.</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_VOLT_MULT`}>
          Current · {currentValueText(voltMultItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_VOLT_MULT}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_VOLT_MULT" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_VOLT_MULT`} />
          </p>
        {/if}
        <Input
          bind:value={voltMultDraft}
          class="mt-4"
          inputmode="decimal"
          onchange={(event) => stage(voltMultItem, (event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => stage(voltMultItem, (event.currentTarget as HTMLInputElement).value)}
          step="0.01"
          testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_VOLT_MULT`}
          type="number"
        />
      </Card.Root>
    {/if}
  </div>

  <div class="grid gap-3 xl:grid-cols-3">
    {#if ampPerVoltItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{ampPerVoltItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">Manual current scaling remains staged through the shared review tray.</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_AMP_PERVLT`}>
          Current · {currentValueText(ampPerVoltItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_AMP_PERVLT}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_AMP_PERVLT" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_AMP_PERVLT`} />
          </p>
        {/if}
        <Input
          bind:value={ampPerVoltDraft}
          class="mt-4"
          inputmode="decimal"
          onchange={(event) => stage(ampPerVoltItem, (event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => stage(ampPerVoltItem, (event.currentTarget as HTMLInputElement).value)}
          step="0.01"
          testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_AMP_PERVLT`}
          type="number"
        />
      </Card.Root>
    {/if}

    {#if capacityItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{capacityItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">Set the truthful pack capacity when the current installation differs from defaults.</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_CAPACITY`}>
          Current · {currentValueText(capacityItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_CAPACITY}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_CAPACITY" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_CAPACITY`} />
          </p>
        {/if}
        <Input
          bind:value={capacityDraft}
          class="mt-4"
          inputmode="decimal"
          onchange={(event) => stage(capacityItem, (event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => stage(capacityItem, (event.currentTarget as HTMLInputElement).value)}
          step="100"
          testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_CAPACITY`}
          type="number"
        />
      </Card.Root>
    {/if}

    {#if lowVoltItem}
      <Card.Root as="article" density="compact" surface="elevated">
        <h4 class="text-base font-semibold text-text-primary">{lowVoltItem.label}</h4>
        <p class="mt-2 text-sm text-text-secondary">Manual low-voltage staging remains available alongside chemistry presets.</p>
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT_LOW_VOLT`}>
          Current · {currentValueText(lowVoltItem)}
        </Eyebrow>
        {#if params.stagedEdits.BATT_LOW_VOLT}
          <p class="mt-2">
            <SetupStagedBadge name="BATT_LOW_VOLT" onUnstage={unstage} testId={`${setupWorkspaceTestIds.batteryStagedPrefix}-BATT_LOW_VOLT`} />
          </p>
        {/if}
        <Input
          bind:value={lowVoltDraft}
          class="mt-4"
          inputmode="decimal"
          onchange={(event) => stage(lowVoltItem, (event.currentTarget as HTMLInputElement).value)}
          oninput={(event) => stage(lowVoltItem, (event.currentTarget as HTMLInputElement).value)}
          step="0.1"
          testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT_LOW_VOLT`}
          type="number"
        />
      </Card.Root>
    {/if}
  </div>

  {#if secondBatteryVisible}
    <Card.Root as="article" density="compact" surface="elevated">
      <Eyebrow tracking="widest">Battery 2</Eyebrow>
      <h4 class="mt-2 text-base font-semibold text-text-primary">Optional secondary monitor visibility</h4>
      <HelperText class="mt-2">
        The active scope exposes at least part of the BATT2_* family, so the secondary monitor stays visible instead of disappearing behind generic raw rows.
      </HelperText>
      {#if secondMonitorItem}
        <Eyebrow class="mt-3" tracking="widest" testId={`${setupWorkspaceTestIds.batteryCurrentPrefix}-BATT2_MONITOR`}>
          Current · {currentValueText(secondMonitorItem)}
        </Eyebrow>
        <div class="mt-4">
          <SetupParamEnumControl
            disabled={actionsBlocked || secondMonitorOptions.length === 0}
            id="setup-battery-secondary-monitor"
            onChange={(value) => stage(secondMonitorItem, value, true, secondMonitorOptions.length)}
            options={secondMonitorOptions}
            testId={`${setupWorkspaceTestIds.batteryInputPrefix}-BATT2_MONITOR`}
            value={secondMonitorDraft}
          />
        </div>
      {:else}
        <HelperText class="mt-3" tone="warning">Battery 2 is only partially modeled on this scope, so the secondary rows stay summary-only until the missing parameters return.</HelperText>
      {/if}
    </Card.Root>
  {/if}

      {#if recoveryReasons.length > 0}
        <Alert variant="warning" density="compact" shadow={false} testId={setupWorkspaceTestIds.batteryRecovery}>
          <p class="font-semibold text-text-primary">Battery monitor recovery is active.</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            {#each recoveryReasons as reason (reason)}
              <li>{reason}</li>
            {/each}
          </ul>
        </Alert>
      {/if}
  {/snippet}
</SetupSectionShell>
