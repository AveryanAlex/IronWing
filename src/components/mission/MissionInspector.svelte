<script lang="ts">
import type { HomePosition } from "../../mission";
import {
  commandDisplayName,
  commandPosition,
  defaultCommand,
  geoPoint3dLatLon,
  withCommandField,
  type MissionCommand,
  type MissionItem,
} from "../../lib/mavkit-types";
import {
  rawFallbackParams,
  resolveCommandMetadata,
  variantToCommandId,
  type ParamSlot,
  type TypedFieldDescriptor,
} from "../../lib/mission-command-metadata";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { SurveyRegion } from "../../lib/survey-region";
import type { MissionPlannerSelection } from "../../lib/stores/mission-planner";
import type { MissionPlannerSurveyPromptView } from "../../lib/stores/mission-planner-view";
import MissionCommandPicker from "./MissionCommandPicker.svelte";
import MissionSurveyInspector from "./MissionSurveyInspector.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type EditableField = {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  value: number | boolean | string;
  units?: string;
  description?: string;
  supported?: boolean;
  enumOptions?: { value: string; label: string }[];
};

type Props = {
  selection: MissionPlannerSelection;
  item: TypedDraftItem | null;
  previousItem: TypedDraftItem | null;
  home: HomePosition | null;
  cruiseSpeed: number;
  selectedSurveyRegion: SurveyRegion | null;
  surveyPrompt: MissionPlannerSurveyPromptView | null;
  onUpdateCommand: (index: number, command: MissionCommand) => void;
  onUpdateLatitude: (index: number, latitudeDeg: number) => void;
  onUpdateLongitude: (index: number, longitudeDeg: number) => void;
  onUpdateAltitude: (index: number, altitudeM: number) => void;
  onUpdateSurveyRegion: (regionId: string, updater: (region: SurveyRegion) => SurveyRegion) => void;
  onGenerateSurveyRegion: (regionId: string) => Promise<unknown> | unknown;
  onPromptDissolveSurveyRegion: (regionId: string) => void;
  onDeleteSurveyRegion: (regionId: string) => void;
  onConfirmSurveyPrompt: () => Promise<unknown> | unknown;
  onDismissSurveyPrompt: () => void;
  onMarkSurveyRegionItemAsEdited: (regionId: string, localIndex: number, editedItem: MissionItem) => void;
};

const RAW_FIELD_ORDER: ParamSlot[] = ["param1", "param2", "param3", "param4", "x", "y", "z"];

let {
  selection,
  item,
  previousItem,
  home,
  cruiseSpeed,
  selectedSurveyRegion,
  surveyPrompt,
  onUpdateCommand,
  onUpdateLatitude,
  onUpdateLongitude,
  onUpdateAltitude,
  onUpdateSurveyRegion,
  onGenerateSurveyRegion,
  onPromptDissolveSurveyRegion,
  onDeleteSurveyRegion,
  onConfirmSurveyPrompt,
  onDismissSurveyPrompt,
  onMarkSurveyRegionItemAsEdited,
}: Props = $props();

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function commandVariant(command: MissionCommand): { category: "Nav" | "Do" | "Condition"; variant: string } | null {
  if ("Nav" in command) {
    return {
      category: "Nav",
      variant: typeof command.Nav === "string" ? command.Nav : Object.keys(command.Nav)[0] ?? "Waypoint",
    };
  }

  if ("Do" in command) {
    return {
      category: "Do",
      variant: typeof command.Do === "string" ? command.Do : Object.keys(command.Do)[0] ?? "Jump",
    };
  }

  if ("Condition" in command) {
    return {
      category: "Condition",
      variant: Object.keys(command.Condition)[0] ?? "Delay",
    };
  }

  return null;
}

function commandPayload(command: MissionCommand): Record<string, unknown> | null {
  const variant = commandVariant(command);
  if (!variant) {
    return null;
  }

  if (variant.category === "Nav") {
    if (typeof command.Nav === "string") {
      return null;
    }
    return (command.Nav as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
  }

  if (variant.category === "Do") {
    if (typeof command.Do === "string") {
      return null;
    }
    return (command.Do as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
  }

  return (command.Condition as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
}

function commandSelectValue(command: MissionCommand): string {
  const variant = commandVariant(command);
  return variant ? `${variant.category}:${variant.variant}` : "";
}

function typedDescriptor(command: MissionCommand, fieldKey: string): TypedFieldDescriptor | undefined {
  if ("Other" in command) {
    return undefined;
  }

  const variant = commandVariant(command);
  if (!variant) {
    return undefined;
  }

  const commandId = variantToCommandId(variant.category, variant.variant);
  if (commandId === undefined) {
    return undefined;
  }

  return resolveCommandMetadata(commandId).typedFields?.[fieldKey];
}

function rawFields(command: MissionCommand) {
  if (!("Other" in command)) {
    return [] as EditableField[];
  }

  const metadata = rawFallbackParams(command.Other.command);
  return RAW_FIELD_ORDER.map((slot) => ({
    key: slot,
    label: metadata.params[slot]?.label ?? titleCase(slot),
    type: "number" as const,
    value: command.Other[slot],
    units: metadata.params[slot]?.units,
    description: metadata.params[slot]?.description,
    supported: metadata.params[slot]?.supported ?? true,
  }));
}

function editableFields(command: MissionCommand): EditableField[] {
  if ("Other" in command) {
    return rawFields(command);
  }

  const payload = commandPayload(command);
  if (!payload) {
    return [];
  }

  return Object.entries(payload)
    .filter(([fieldKey]) => fieldKey !== "position")
    .flatMap(([fieldKey, value]) => {
      const descriptor = typedDescriptor(command, fieldKey);
      if (descriptor?.hidden) {
        return [];
      }

      const common = {
        key: fieldKey,
        label: descriptor?.label ?? titleCase(fieldKey),
        units: descriptor?.units,
        description: descriptor?.description,
        supported: descriptor?.supported ?? true,
      };

      if (typeof value === "number") {
        return [{ ...common, type: "number" as const, value }];
      }

      if (typeof value === "boolean") {
        return [{ ...common, type: "boolean" as const, value }];
      }

      if (typeof value === "string") {
        return [{
          ...common,
          type: "enum" as const,
          value,
          enumOptions: descriptor?.enumValues ?? [{ value, label: titleCase(value) }],
        }];
      }

      return [];
    });
}

function selectedMissionItem(commandItem: TypedDraftItem | null): MissionItem | null {
  if (!commandItem) {
    return null;
  }

  return commandItem.document as MissionItem;
}

let missionItem = $derived(selectedMissionItem(item));
let position = $derived(missionItem ? commandPosition(missionItem.command) : null);
let selectedCommandVariant = $derived(missionItem ? commandVariant(missionItem.command) : null);
let selectedCommandValue = $derived(missionItem ? commandSelectValue(missionItem.command) : "");
let fields = $derived(missionItem ? editableFields(missionItem.command) : []);
let previousCoordinates = $derived.by(() => {
  if (!previousItem || previousItem.preview.latitude_deg === null || previousItem.preview.longitude_deg === null) {
    return null;
  }

  return `${previousItem.preview.latitude_deg.toFixed(5)}, ${previousItem.preview.longitude_deg.toFixed(5)}`;
});

function updateField(fieldKey: string, value: unknown) {
  if (!missionItem || !item || item.readOnly) {
    return;
  }

  onUpdateCommand(item.index, withCommandField(missionItem.command, fieldKey, value));
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.inspector}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Inspector</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Selected mission detail</h3>
    </div>

    <span
      class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
      data-testid={missionWorkspaceTestIds.inspectorSelectionKind}
    >
      {selection.kind}
    </span>
  </div>

  {#if selection.kind === "home"}
    <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-5 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.inspectorEmpty}>
      Home is selected. Edit the Home card to set or clear mission origin data, or select a manual mission item or survey region to edit it inside the shared workspace.
      {#if home}
        <p class="mt-2 text-xs text-text-muted">Current Home · {home.latitude_deg.toFixed(5)}, {home.longitude_deg.toFixed(5)} · {home.altitude_m.toFixed(1)} m</p>
      {/if}
    </div>
  {:else if selection.kind === "survey-block"}
    {#if selectedSurveyRegion}
      <MissionSurveyInspector
        cruiseSpeed={cruiseSpeed}
        onConfirmSurveyPrompt={onConfirmSurveyPrompt}
        onDeleteRegion={onDeleteSurveyRegion}
        onDismissSurveyPrompt={onDismissSurveyPrompt}
        onGenerateRegion={onGenerateSurveyRegion}
        onMarkGeneratedItemEdited={(regionId, localIndex, editedItem) => onMarkSurveyRegionItemAsEdited(regionId, localIndex, editedItem)}
        onPromptDissolveRegion={onPromptDissolveSurveyRegion}
        onUpdateRegion={(regionId, updater) => onUpdateSurveyRegion(regionId, updater)}
        region={selectedSurveyRegion}
        {surveyPrompt}
      />
    {:else}
      <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-5 text-sm text-warning" data-testid={missionWorkspaceTestIds.inspectorReadonly}>
        <p class="font-semibold">Survey selection unavailable</p>
        <p class="mt-2 text-xs text-warning/90">
          The selected survey region could not be resolved from the active planner state, so the inspector stayed fail-closed instead of rendering broken controls.
        </p>
      </div>
    {/if}
  {:else if !item || !missionItem}
    <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-5 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.inspectorEmpty}>
      Select a manual mission item from the list to edit coordinates and typed command fields.
    </div>
  {:else}
    <div class="mt-4 space-y-4">
      <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Manual item {item.index + 1}</p>
        <h4 class="mt-1 text-base font-semibold text-text-primary">{commandDisplayName(missionItem.command)}</h4>
        {#if previousCoordinates}
          <p class="mt-1 text-xs text-text-secondary">Previous manual item · {previousCoordinates}</p>
        {/if}
      </div>

      {#if item.readOnly}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning" data-testid={missionWorkspaceTestIds.inspectorReadonly}>
          <p class="font-semibold">Unsupported/raw mission item</p>
          <p class="mt-1 text-xs text-warning/90">This preserved command stays read-only. Its raw parameters remain visible so imported content is not flattened away.</p>
          <dl class="mt-3 grid gap-2 sm:grid-cols-2">
            {#each fields as field (field.key)}
              <div class="rounded-xl border border-warning/30 bg-bg-primary px-3 py-2 text-xs">
                <dt class="text-warning/80">{field.label}</dt>
                <dd class="mt-1 font-medium text-text-primary">{field.value}{field.units ? ` ${field.units}` : ""}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {:else}
        {#if selectedCommandVariant}
          <div data-testid={missionWorkspaceTestIds.inspectorCommandPicker}>
            <label class="space-y-1">
              <span class="text-xs font-medium text-text-muted">Command</span>
              <MissionCommandPicker
                disabled={false}
                value={selectedCommandValue}
                onSelect={(category, variant) => {
                  onUpdateCommand(item.index, defaultCommand(category, variant, position ?? undefined));
                }}
              />
            </label>
          </div>
        {/if}

        {#if fields.length > 0}
          <div class="grid gap-3 md:grid-cols-2">
            {#each fields as field (field.key)}
              <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
                <span class="text-xs font-medium text-text-muted">{field.label}</span>

                {#if field.type === "number"}
                  <div class="relative">
                    <input
                      class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 pr-12 text-sm text-text-primary"
                      data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                      inputmode="decimal"
                      onchange={(event) => {
                        const rawValue = (event.currentTarget as HTMLInputElement).value;
                        if (rawValue.trim().length === 0) {
                          return;
                        }
                        const nextValue = Number(rawValue);
                        if (Number.isFinite(nextValue)) {
                          updateField(field.key, nextValue);
                        }
                      }}
                      type="number"
                      value={field.value}
                    />
                    {#if field.units}
                      <span class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-text-muted">{field.units}</span>
                    {/if}
                  </div>
                {:else if field.type === "boolean"}
                  <button
                    class={`rounded-md px-3 py-2 text-xs font-semibold transition ${field.value
                      ? "border border-accent/40 bg-accent/10 text-accent"
                      : "border border-border bg-bg-primary text-text-primary"}`}
                    data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    onclick={() => updateField(field.key, !field.value)}
                    type="button"
                  >
                    {field.value ? "Enabled" : "Disabled"}
                  </button>
                {:else}
                  <select
                    class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                    data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    onchange={(event) => updateField(field.key, (event.currentTarget as HTMLSelectElement).value)}
                    value={field.value}
                  >
                    {#each field.enumOptions ?? [] as option (option.value)}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                {/if}

                {#if field.description}
                  <span class="text-xs text-text-secondary">{field.description}</span>
                {/if}
              </label>
            {/each}
          </div>
        {/if}

        {#if position}
          <div class="grid gap-3 md:grid-cols-3">
            <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
              <span class="text-xs font-medium text-text-muted">Latitude</span>
              <input
                class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                data-testid={missionWorkspaceTestIds.inspectorLatitude}
                inputmode="decimal"
                onchange={(event) => {
                  const rawValue = (event.currentTarget as HTMLInputElement).value;
                  if (rawValue.trim().length === 0) {
                    return;
                  }
                  const nextValue = Number(rawValue);
                  if (Number.isFinite(nextValue)) {
                    onUpdateLatitude(item.index, nextValue);
                  }
                }}
                type="number"
                value={geoPoint3dLatLon(position).latitude_deg}
              />
            </label>

            <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
              <span class="text-xs font-medium text-text-muted">Longitude</span>
              <input
                class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                data-testid={missionWorkspaceTestIds.inspectorLongitude}
                inputmode="decimal"
                onchange={(event) => {
                  const rawValue = (event.currentTarget as HTMLInputElement).value;
                  if (rawValue.trim().length === 0) {
                    return;
                  }
                  const nextValue = Number(rawValue);
                  if (Number.isFinite(nextValue)) {
                    onUpdateLongitude(item.index, nextValue);
                  }
                }}
                type="number"
                value={geoPoint3dLatLon(position).longitude_deg}
              />
            </label>

            <label class="space-y-1 rounded-lg border border-border bg-bg-secondary/60 p-3">
              <span class="text-xs font-medium text-text-muted">Altitude</span>
              <input
                class="w-full rounded-xl border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary"
                data-testid={missionWorkspaceTestIds.inspectorAltitude}
                inputmode="decimal"
                onchange={(event) => {
                  const rawValue = (event.currentTarget as HTMLInputElement).value;
                  if (rawValue.trim().length === 0) {
                    return;
                  }
                  const nextValue = Number(rawValue);
                  if (Number.isFinite(nextValue)) {
                    onUpdateAltitude(item.index, nextValue);
                  }
                }}
                type="number"
                value={item.preview.altitude_m ?? 0}
              />
            </label>
          </div>
        {:else}
          <div class="rounded-lg border border-border bg-bg-secondary/60 px-4 py-4 text-sm text-text-secondary">
            This command does not expose coordinate fields. Switching between commands updates the inspector fields truthfully instead of leaving stale coordinate inputs mounted.
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
