<script lang="ts">
import { AlertTriangle, Info, Settings2 } from "lucide-svelte";
import type { HomePosition } from "../../../mission";
import {
  commandPosition,
  defaultCommand,
  geoPoint3dLatLon,
  withCommandField,
  type MissionCommand,
  type MissionItem,
} from "../../../lib/mavkit-types";
import {
  rawFallbackParams,
  resolveCommandMetadata,
  variantToCommandId,
  type CommandMetadata,
  type ParamSlot,
  type TypedFieldDescriptor,
} from "../../../lib/mission-command-metadata";
import type { TypedDraftItem } from "../../../lib/mission-draft-typed";
import type { SurveyRegion } from "../../../lib/survey-region";
import type { MissionPlannerSelection } from "../../../lib/stores/mission-planner";
import type { MissionPlannerSurveyPromptView } from "../../../lib/stores/mission-planner-view";
import MissionCommandPicker from "./MissionCommandPicker.svelte";
import MissionSurveyInspector from "./MissionSurveyInspector.svelte";
import { Alert, Badge, Card, EmptyState, ExternalLink, Eyebrow, FactTile, Field, HelperText, IconButton, NativeSelect, NumberInput, Switch, Tooltip } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

function fieldDescriptionId(fieldKey: string) {
  return `${fieldHelpId(fieldKey)}-description`;
}

function numericFieldValue(field: EditableField) {
  return typeof field.value === "number" ? field.value + (field.displayOffset ?? 0) : field.value;
}

function setFieldInfoOpen(fieldKey: string, open: boolean) {
  if (open) {
    expandedFieldKey = fieldKey;
    return;
  }

  if (expandedFieldKey === fieldKey) {
    expandedFieldKey = null;
  }
}

function inputValue(event: Event): string {
  return event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : "";
}

function selectValue(event: Event): string {
  return event.currentTarget instanceof HTMLSelectElement ? event.currentTarget.value : "";
}

function coordinateInputValue(value: number): number {
  return Number(value.toFixed(7));
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

<Card.Root as="section" density="compact" testId={missionWorkspaceTestIds.inspector}>
  <div class="flex items-center gap-2">
    <Settings2 aria-hidden="true" class="shrink-0 text-accent" size={16} />
    <Eyebrow tracking="widest">Inspector</Eyebrow>

    <Badge case="normal" class="ml-auto" variant="muted" testId={missionWorkspaceTestIds.inspectorSelectionKind}>
      {selection.kind === "mission-item" && item ? `mission-item · #${item.index + 1}` : selection.kind}
    </Badge>
  </div>

  {#if selection.kind === "home"}
    <EmptyState
      class="mt-4"
      description="Edit the Home card to set mission origin data, or select a manual mission item or survey region to edit it inside the shared workspace."
      testId={missionWorkspaceTestIds.inspectorEmpty}
      title="Home is selected."
    />
    {#if home}
      <HelperText class="mt-2" size="xs">Current Home · {home.latitude_deg.toFixed(5)}, {home.longitude_deg.toFixed(5)} · {home.altitude_m.toFixed(1)} m</HelperText>
    {/if}
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
      <Alert class="mt-4" density="compact" variant="warning" testId={missionWorkspaceTestIds.inspectorReadonly}>
        <p class="font-semibold">Survey selection unavailable</p>
        <p class="mt-2 text-xs text-warning/90">
          The selected survey region could not be resolved from the active planner state, so the inspector stayed fail-closed instead of rendering broken controls.
        </p>
      </Alert>
    {/if}
  {:else if !item || !missionItem}
    <EmptyState
      class="mt-4"
      testId={missionWorkspaceTestIds.inspectorEmpty}
      title="Select a manual mission item from the list."
      description="Coordinates and typed command fields appear here once a mission item is selected."
    />
  {:else}
    <div class="mt-4 space-y-3">
      {#if item.readOnly}
        <Alert density="compact" layout="stacked" variant="warning" testId={missionWorkspaceTestIds.inspectorReadonly}>
          <p class="font-semibold">Unsupported/raw mission item</p>
          <p class="mt-1 text-xs text-warning/90">This preserved command stays read-only. Its raw parameters remain visible so imported content is not flattened away.</p>
          <dl class="mt-3 grid gap-2 sm:grid-cols-2">
            {#each fields as field (field.key)}
              <FactTile density="compact" label={field.label} tone="warning" value={String(field.value)} unit={field.units} />
            {/each}
          </dl>
        </Alert>
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
          <Alert
            class="rounded-md text-[10px] leading-relaxed"
            density="compact"
            shadow={false}
            testId={missionWorkspaceTestIds.inspectorCommandHelp}
            variant="info"
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
              <ExternalLink
                class="mt-1.5 text-[10px]"
                testId={missionWorkspaceTestIds.inspectorCommandDocs}
                href={selectedCommandMetadata.docsUrl}
              >
                ArduPilot Docs
              </ExternalLink>
            {/if}
          </Alert>
        {/if}

        {#if fields.length > 0}
          <div class="space-y-1.5">
            <p class="text-[10px] font-medium text-text-muted">Parameters</p>
            {#each fields as field (field.key)}
              <Field.Root class={`gap-1 ${field.supported === false ? "opacity-60" : ""}`}>
                <div class="flex items-center gap-1">
                  <Field.Label class="text-[10px] text-text-muted" for={fieldInputId(field.key)}>
                    {field.label}
                  </Field.Label>
                  {#if field.required}
                    <span aria-label="required" class="text-warning">*</span>
                    <span class="text-[9px] text-warning/80">required</span>
                  {/if}
                  {#if field.description}
                    <Tooltip
                      align="start"
                      clickToToggle
                      contentId={`${fieldHelpId(field.key)}-tooltip`}
                      contentTestId={fieldHelpId(field.key)}
                      description={field.description}
                      label={`${field.label} help`}
                      onOpenChange={(open) => setFieldInfoOpen(field.key, open)}
                      open={expandedFieldKey === field.key}
                      side="top"
                      title={field.label}
                    >
                      <IconButton
                        aria-controls={`${fieldHelpId(field.key)}-tooltip`}
                        aria-expanded={expandedFieldKey === field.key}
                        ariaLabel={`Show ${field.label} help`}
                        class="rounded-full p-0.5"
                        size="auto"
                        testId={`${missionWorkspaceTestIds.inspectorFieldInfoPrefix}-${field.key}`}
                        title=""
                        tone="accent"
                        variant="ghost"
                        type="button"
                      >
                        <Info aria-hidden="true" size={11} />
                      </IconButton>
                    </Tooltip>
                    <span class="sr-only" id={fieldDescriptionId(field.key)}>{field.description}</span>
                  {/if}
                </div>

                {#if field.supported === false && !field.description}
                  <p class="text-[10px] leading-relaxed text-warning/80">Not supported by ArduPilot for this command.</p>
                {/if}

                {#if field.type === "number"}
                  <NumberInput
                    aria-describedby={field.description ? fieldDescriptionId(field.key) : undefined}
                    class="tabular-nums"
                    disabled={field.supported === false}
                    id={fieldInputId(field.key)}
                    inputmode="decimal"
                    onchange={(event) => updateNumberField(field, inputValue(event))}
                    size="sm"
                    testId={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    unit={field.units}
                    value={Number(numericFieldValue(field))}
                  />
                {:else if field.type === "boolean"}
                  <Switch
                    aria-describedby={field.description ? fieldDescriptionId(field.key) : undefined}
                    checked={Boolean(field.value)}
                    disabled={field.supported === false}
                    id={fieldInputId(field.key)}
                    label={field.value ? "Enabled" : "Disabled"}
                    onCheckedChange={(checked) => updateField(field.key, checked)}
                    testId={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                  />
                {:else}
                  <NativeSelect
                    aria-describedby={field.description ? fieldDescriptionId(field.key) : undefined}
                    disabled={field.supported === false}
                    id={fieldInputId(field.key)}
                    onchange={(event) => updateField(field.key, selectValue(event))}
                    options={field.enumOptions ?? []}
                    size="sm"
                    testId={`${missionWorkspaceTestIds.inspectorFieldPrefix}-${field.key}`}
                    value={String(field.value)}
                  />
                {/if}
              </Field.Root>
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
              <Field.Root class="gap-1">
                <Field.Label class="text-[10px] text-text-muted">Latitude (deg)</Field.Label>
                  <NumberInput
                    class="tabular-nums"
                    inputmode="decimal"
                    onchange={updateLatitudeInput}
                    size="sm"
                    testId={missionWorkspaceTestIds.inspectorLatitude}
                    value={coordinateInputValue(geoPoint3dLatLon(position).latitude_deg)}
                  />
              </Field.Root>

              <Field.Root class="gap-1">
                <Field.Label class="text-[10px] text-text-muted">Longitude (deg)</Field.Label>
                  <NumberInput
                    class="tabular-nums"
                    inputmode="decimal"
                    onchange={updateLongitudeInput}
                    size="sm"
                    testId={missionWorkspaceTestIds.inspectorLongitude}
                    value={coordinateInputValue(geoPoint3dLatLon(position).longitude_deg)}
                  />
              </Field.Root>
            </div>

            <Field.Root class="gap-1">
              <Field.Label class="text-[10px] text-text-muted">Altitude (m)</Field.Label>
              <NumberInput
                class="tabular-nums"
                inputmode="decimal"
                onchange={updateAltitudeInput}
                size="sm"
                testId={missionWorkspaceTestIds.inspectorAltitude}
                value={item.preview.altitude_m ?? 0}
              />
            </Field.Root>
          </div>
        {:else}
          <EmptyState
            title="No coordinate fields for this command."
            description="Switching between commands updates the inspector fields truthfully instead of leaving stale coordinate inputs mounted."
          />
        {/if}
      {/if}
    </div>
  {/if}
</Card.Root>
