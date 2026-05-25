<script lang="ts">
import { AlertTriangle, ExternalLink, Info, Settings2 } from "lucide-svelte";
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
  type CommandMetadata,
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
  required?: boolean;
  supported?: boolean;
  enumOptions?: { value: string; label: string }[];
  displayOffset?: number;
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
const ONE_INDEXED_FIELDS = new Set(["target_index"]);

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

let expandedFieldKey = $state<string | null>(null);

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
  if ("Nav" in command) {
    const variant = commandVariant(command);
    if (!variant) {
      return null;
    }

    if (typeof command.Nav === "string") {
      return null;
    }
    return (command.Nav as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
  }

  if ("Do" in command) {
    const variant = commandVariant(command);
    if (!variant) {
      return null;
    }

    if (typeof command.Do === "string") {
      return null;
    }
    return (command.Do as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
  }

  if (!("Condition" in command)) {
    return null;
  }

  const variant = commandVariant(command);
  if (!variant) {
    return null;
  }

  return (command.Condition as Record<string, Record<string, unknown>>)[variant.variant] ?? null;
}

function commandSelectValue(command: MissionCommand): string {
  const variant = commandVariant(command);
  return variant ? `${variant.category}:${variant.variant}` : "";
}

function commandMetadata(command: MissionCommand): CommandMetadata | null {
  if ("Other" in command) {
    return rawFallbackParams(command.Other.command);
  }

  const variant = commandVariant(command);
  if (!variant) {
    return null;
  }

  const commandId = variantToCommandId(variant.category, variant.variant);
  return commandId === undefined ? null : resolveCommandMetadata(commandId);
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
    required: metadata.params[slot]?.required,
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
    .flatMap<EditableField>(([fieldKey, value]) => {
      const descriptor = typedDescriptor(command, fieldKey);
      if (descriptor?.hidden) {
        return [];
      }

      const common = {
        key: fieldKey,
        label: descriptor?.label ?? titleCase(fieldKey),
        units: descriptor?.units,
        description: descriptor?.description,
        required: descriptor?.required,
        supported: descriptor?.supported ?? true,
        displayOffset: ONE_INDEXED_FIELDS.has(fieldKey) ? 1 : undefined,
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
let selectedCommandMetadata = $derived(missionItem ? commandMetadata(missionItem.command) : null);
let fields = $derived(missionItem ? editableFields(missionItem.command) : []);
let previousCoordinates = $derived.by(() => {
  if (!previousItem || previousItem.preview.latitude_deg === null || previousItem.preview.longitude_deg === null) {
    return null;
  }

  return `${previousItem.preview.latitude_deg.toFixed(5)}, ${previousItem.preview.longitude_deg.toFixed(5)}`;
});

function fieldInputId(fieldKey: string) {
  return `mission-inspector-${item?.uiId ?? "none"}-${fieldKey}`;
}

function fieldHelpId(fieldKey: string) {
  return `${missionWorkspaceTestIds.inspectorFieldHelpPrefix}-${fieldKey}`;
}

function numericFieldValue(field: EditableField) {
  return typeof field.value === "number" ? field.value + (field.displayOffset ?? 0) : field.value;
}

function toggleFieldInfo(fieldKey: string) {
  expandedFieldKey = expandedFieldKey === fieldKey ? null : fieldKey;
}

function inputValue(event: Event): string {
  return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : "";
}

function selectValue(event: Event): string {
  return event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : "";
}

function updateField(fieldKey: string, value: unknown) {
  if (!missionItem || !item || item.readOnly) {
    return;
  }

  onUpdateCommand(item.index, withCommandField(missionItem.command, fieldKey, value));
}

function updateNumberField(field: EditableField, rawValue: string) {
  if (rawValue.trim().length === 0) {
    return;
  }

  const nextValue = Number(rawValue);
  if (Number.isFinite(nextValue)) {
    updateField(field.key, nextValue - (field.displayOffset ?? 0));
  }
}

function updateLatitudeInput(event: Event) {
  if (!item) {
    return;
  }

  const rawValue = inputValue(event);
  if (rawValue.trim().length === 0) {
    return;
  }

  const nextValue = Number(rawValue);
  if (Number.isFinite(nextValue)) {
    onUpdateLatitude(item.index, nextValue);
  }
}

function updateLongitudeInput(event: Event) {
  if (!item) {
    return;
  }

  const rawValue = inputValue(event);
  if (rawValue.trim().length === 0) {
    return;
  }

  const nextValue = Number(rawValue);
  if (Number.isFinite(nextValue)) {
    onUpdateLongitude(item.index, nextValue);
  }
}

function updateAltitudeInput(event: Event) {
  if (!item) {
    return;
  }

  const rawValue = inputValue(event);
  if (rawValue.trim().length === 0) {
    return;
  }

  const nextValue = Number(rawValue);
  if (Number.isFinite(nextValue)) {
    onUpdateAltitude(item.index, nextValue);
  }
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.inspector}>
  <div class="flex items-center gap-2">
    <Settings2 aria-hidden="true" class="shrink-0 text-accent" size={16} />
    <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">Inspector</h3>

    <span
      class="ml-auto text-xs tabular-nums text-text-muted"
      data-testid={missionWorkspaceTestIds.inspectorSelectionKind}
    >
      {selection.kind === "mission-item" && item ? `mission-item · #${item.index + 1}` : selection.kind}
    </span>
  </div>

  {#if selection.kind === "home"}
    <div class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-5 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.inspectorEmpty}>
      Home is selected. Edit the Home card to set mission origin data, or select a manual mission item or survey region to edit it inside the shared workspace.
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
    <div class="mt-4 space-y-3">
      {#if item.readOnly}
        <div class="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning" data-testid={missionWorkspaceTestIds.inspectorReadonly}>
          <p class="font-semibold">Unsupported/raw mission item</p>
          <p class="mt-1 text-xs text-warning/90">This preserved command stays read-only. Its raw parameters remain visible so imported content is not flattened away.</p>
          <dl class="mt-3 grid gap-2 sm:grid-cols-2">
            {#each fields as field (field.key)}
              <div class="rounded-md border border-warning/30 bg-bg-primary px-3 py-2 text-xs">
                <dt class="text-warning/80">{field.label}</dt>
                <dd class="mt-1 font-medium text-text-primary">{field.value}{field.units ? ` ${field.units}` : ""}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {:else}
        {#if selectedCommandVariant}
          <div class="space-y-1" data-testid={missionWorkspaceTestIds.inspectorCommandPicker}>
            <label class="text-[10px] font-medium text-text-muted" for="mission-command-select">Command</label>
            <MissionCommandPicker
              disabled={false}
              value={selectedCommandValue}
              onSelect={(category, variant) => {
                onUpdateCommand(item.index, defaultCommand(category, variant, position ?? undefined));
              }}
            />
            {#if previousCoordinates}
              <p class="text-[10px] text-text-muted">Previous manual item · {previousCoordinates}</p>
            {/if}
          </div>
        {/if}

        {#if selectedCommandMetadata}
          <div
            class="rounded-md border border-border bg-bg-secondary/60 p-2.5 text-[10px] leading-relaxed text-text-muted"
            data-testid={missionWorkspaceTestIds.inspectorCommandHelp}
          >
            <div class="flex items-start gap-1.5">
              <Info aria-hidden="true" class="mt-0.5 shrink-0 text-accent/70" size={12} />
              <span class="text-text-secondary">{selectedCommandMetadata.summary}</span>
            </div>

            {#if selectedCommandMetadata.notes?.length}
              <ul class="mt-1.5 space-y-1">
                {#each selectedCommandMetadata.notes as note, index (`${note}-${index}`)}
                  <li class="flex items-start gap-1.5">
                    <AlertTriangle aria-hidden="true" class="mt-0.5 shrink-0 text-warning/70" size={11} />
                    <span>{note}</span>
                  </li>
                {/each}
              </ul>
            {/if}

            {#if selectedCommandMetadata.docsUrl}
              <a
                class="mt-1.5 inline-flex items-center gap-1 text-accent transition hover:underline"
                data-testid={missionWorkspaceTestIds.inspectorCommandDocs}
                href={selectedCommandMetadata.docsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                ArduPilot Docs
                <ExternalLink aria-hidden="true" size={11} />
              </a>
            {/if}
          </div>
        {/if}

        {#if fields.length > 0}
          <div class="space-y-1.5">
            <p class="text-[10px] font-medium text-text-muted">Parameters</p>
            {#each fields as field (field.key)}
              <div class={`space-y-0.5 ${field.supported === false ? "opacity-60" : ""}`}>
                <div class="flex items-center gap-1">
                  <label class="text-[10px] text-text-muted" for={fieldInputId(field.key)}>
                    {field.label}
                  </label>
                  {#if field.required}
                    <span aria-label="required" class="text-warning">*</span>
                    <span class="text-[9px] text-warning/80">required</span>
                  {/if}
                  {#if field.description}
                    <span class="group relative inline-flex">
                      <button
                        aria-controls={fieldHelpId(field.key)}
                        aria-expanded={expandedFieldKey === field.key}
                        aria-label={`Show ${field.label} help`}
                        class="rounded-full p-0.5 text-text-muted transition hover:bg-bg-tertiary hover:text-accent"
                        data-testid={`${missionWorkspaceTestIds.inspectorFieldInfoPrefix}-${field.key}`}
                        onclick={() => toggleFieldInfo(field.key)}
                        type="button"
                      >
                        <Info aria-hidden="true" size={11} />
                      </button>
                      <span
                        class={`absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-bg-secondary p-2 text-[10px] leading-relaxed text-text-secondary shadow-lg ${expandedFieldKey === field.key ? "block" : "hidden group-hover:block group-focus-within:block"}`}
                        data-testid={`${missionWorkspaceTestIds.inspectorFieldHelpPrefix}-${field.key}`}
                        id={fieldHelpId(field.key)}
                        role="tooltip"
                      >
                        {field.description}
                      </span>
                    </span>
                  {/if}
                </div>

                {#if field.supported === false && !field.description}
                  <p class="text-[10px] leading-relaxed text-warning/80">Not supported by ArduPilot for this command.</p>
                {/if}

                {#if field.type === "number"}
                  <div class="relative">
                    <input
                      aria-describedby={field.description ? fieldHelpId(field.key) : undefined}
                      class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 pr-12 text-sm tabular-nums text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                      data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                      disabled={field.supported === false}
                      id={fieldInputId(field.key)}
                      inputmode="decimal"
                      onchange={(event) => updateNumberField(field, inputValue(event))}
                      type="number"
                      value={numericFieldValue(field)}
                    />
                    {#if field.units}
                      <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-text-muted/70">{field.units}</span>
                    {/if}
                  </div>
                {:else if field.type === "boolean"}
                  <button
                    aria-describedby={field.description ? fieldHelpId(field.key) : undefined}
                    class={`rounded-md border px-2 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${field.value
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-border bg-bg-input text-text-primary"}`}
                    data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    disabled={field.supported === false}
                    id={fieldInputId(field.key)}
                    onclick={() => updateField(field.key, !field.value)}
                    type="button"
                  >
                    {field.value ? "Enabled" : "Disabled"}
                  </button>
                {:else}
                  <select
                    aria-describedby={field.description ? fieldHelpId(field.key) : undefined}
                    class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    disabled={field.supported === false}
                    id={fieldInputId(field.key)}
                    onchange={(event) => updateField(field.key, selectValue(event))}
                    value={field.value}
                  >
                    {#each field.enumOptions ?? [] as option (option.value)}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        {#if position}
          <div class="space-y-2 border-t border-border/60 pt-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] font-medium text-text-muted">Coordinates</p>
              <span class="text-[10px] text-text-muted">Relative Alt</span>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="space-y-0.5">
                <span class="text-[10px] text-text-muted">Latitude (deg)</span>
                <input
                  class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm tabular-nums text-text-primary"
                  data-testid={missionWorkspaceTestIds.inspectorLatitude}
                  inputmode="decimal"
                  onchange={updateLatitudeInput}
                  type="number"
                  value={geoPoint3dLatLon(position).latitude_deg}
                />
              </label>

              <label class="space-y-0.5">
                <span class="text-[10px] text-text-muted">Longitude (deg)</span>
                <input
                  class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm tabular-nums text-text-primary"
                  data-testid={missionWorkspaceTestIds.inspectorLongitude}
                  inputmode="decimal"
                  onchange={updateLongitudeInput}
                  type="number"
                  value={geoPoint3dLatLon(position).longitude_deg}
                />
              </label>
            </div>

            <label class="block space-y-0.5">
              <span class="text-[10px] text-text-muted">Altitude (m)</span>
              <input
                class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm tabular-nums text-text-primary"
                data-testid={missionWorkspaceTestIds.inspectorAltitude}
                inputmode="decimal"
                onchange={updateAltitudeInput}
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
