<script lang="ts">
import type { HomePosition } from "../../mission";
import type { MissionPlannerAttachmentState, MissionPlannerMode } from "../../lib/stores/mission-planner";
import InfoWidget from "../shared/InfoWidget.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  home: HomePosition | null;
  selected: boolean;
  mode: MissionPlannerMode;
  attachment: MissionPlannerAttachmentState;
  onSelect: () => void;
  onChange: (home: HomePosition | null) => void;
};

let { home, selected, mode, attachment, onSelect, onChange }: Props = $props();

let validationMessage = $state<string | null>(null);
let draftSourceKey = $state<string | null>(null);
let latitudeDraft = $state<string | null>(null);
let longitudeDraft = $state<string | null>(null);
let altitudeDraft = $state<string | null>(null);

let syncKey = $derived(home ? `${home.latitude_deg}:${home.longitude_deg}:${home.altitude_m}` : "no-home");
let readOnly = $derived(!attachment.canEdit);
let readOnlyMessage = $derived(readOnly ? attachment.detail : null);
let modeLabel = $derived(mode === "mission" ? "mission" : mode === "fence" ? "fence" : "rally");
let homeSyncCopy = $derived.by(() => {
  switch (attachment.kind) {
    case "live-attached":
      return "Live mission reads can refresh Home from the vehicle in this scope, but mission / fence / rally upload and clear flows still do not sync Home automatically. Treat Home as shared planning context, not an exportable domain of its own.";
    case "local-draft":
      return "This Home exists only in the current local draft until you explicitly read from the vehicle. Mission / fence / rally upload and clear flows still do not sync Home automatically.";
    case "playback-readonly":
      return "Playback keeps the last known Home visible for inspection only. Reads and edits stay blocked here, and mission / fence / rally upload or clear flows do not sync Home automatically.";
    case "detached-local":
    default:
      return "This preserved Home came from another scope. IronWing keeps it visible as truthful planning context, but it is detached from the active scope and will not sync through mission / fence / rally upload or clear actions.";
  }
});
let homeInfoDescription = $derived(
  `Home stays shared planning context across mission, fence, and rally. ${homeSyncCopy}`,
);
let baseLatitude = $derived(home ? String(home.latitude_deg) : "");
let baseLongitude = $derived(home ? String(home.longitude_deg) : "");
let baseAltitude = $derived(home ? String(home.altitude_m) : "");
let latitude = $derived(draftSourceKey === syncKey && latitudeDraft !== null ? latitudeDraft : baseLatitude);
let longitude = $derived(draftSourceKey === syncKey && longitudeDraft !== null ? longitudeDraft : baseLongitude);
let altitude = $derived(draftSourceKey === syncKey && altitudeDraft !== null ? altitudeDraft : baseAltitude);
let visibleValidationMessage = $derived(draftSourceKey === syncKey ? validationMessage : null);

function beginDraft() {
  if (draftSourceKey === syncKey) {
    return;
  }

  draftSourceKey = syncKey;
  latitudeDraft = baseLatitude;
  longitudeDraft = baseLongitude;
  altitudeDraft = baseAltitude;
  validationMessage = null;
}

function resetDraft() {
  draftSourceKey = null;
  latitudeDraft = null;
  longitudeDraft = null;
  altitudeDraft = null;
  validationMessage = null;
}

function commitHome() {
  if (readOnly) {
    validationMessage = attachment.detail;
    return;
  }

  const trimmed = {
    latitude: latitude.trim(),
    longitude: longitude.trim(),
    altitude: altitude.trim(),
  };

  if (!trimmed.latitude && !trimmed.longitude && !trimmed.altitude) {
    resetDraft();
    onChange(null);
    return;
  }

  if (!trimmed.latitude || !trimmed.longitude || !trimmed.altitude) {
    validationMessage = "Enter latitude, longitude, and altitude before committing Home.";
    return;
  }

  const nextLatitude = Number(trimmed.latitude);
  const nextLongitude = Number(trimmed.longitude);
  const nextAltitude = Number(trimmed.altitude);

  if (![nextLatitude, nextLongitude, nextAltitude].every((value) => Number.isFinite(value))) {
    validationMessage = "Enter latitude, longitude, and altitude before committing Home.";
    return;
  }

  resetDraft();
  onChange({
    latitude_deg: nextLatitude,
    longitude_deg: nextLongitude,
    altitude_m: nextAltitude,
  });
}

function clearHome() {
  if (readOnly) {
    validationMessage = attachment.detail;
    return;
  }

  resetDraft();
  onChange(null);
}

function handleEnter(event: KeyboardEvent) {
  if (event.key === "Enter") {
    (event.currentTarget as HTMLInputElement).blur();
  }
}
</script>

<section
  class={`rounded-lg border p-2.5 transition ${selected
    ? "border-accent/40 bg-accent/10"
    : "border-border bg-bg-primary"}`}
  data-selected={selected ? "true" : "false"}
  data-testid={missionWorkspaceTestIds.homeCard}
>
  <div class="flex flex-wrap items-start justify-between gap-2.5">
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-sm font-semibold text-text-primary">Home</h3>
        <InfoWidget
          align="right"
          contentTestId={missionWorkspaceTestIds.homeSync}
          description={homeInfoDescription}
          panelTestId={missionWorkspaceTestIds.homeInfoPopup}
          testId={missionWorkspaceTestIds.homeInfoButton}
          title="Shared planning context"
        />
      </div>
      <p class="mt-1 text-xs text-text-secondary" data-testid={missionWorkspaceTestIds.homeSummary}>
        {home
          ? `${home.latitude_deg.toFixed(5)}, ${home.longitude_deg.toFixed(5)} · ${home.altitude_m.toFixed(1)} m`
          : `Set a Home position explicitly for this ${modeLabel} draft; incomplete values stay local until all three fields are valid.`}
      </p>
      {#if readOnlyMessage}
        <p class="mt-1.5 text-xs text-warning" data-testid={missionWorkspaceTestIds.homeReadOnly}>{readOnlyMessage}</p>
      {/if}
    </div>

    <button
      class="rounded-md border border-border bg-bg-secondary px-2.5 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.homeClear}
      disabled={readOnly}
      onclick={() => {
        onSelect();
        clearHome();
      }}
      type="button"
    >
      Clear
    </button>
  </div>

  <div class="mt-3 grid gap-2 sm:grid-cols-3">
    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Latitude</span>
      <input
        class="w-full rounded-lg border border-border bg-bg-secondary px-2.5 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
        data-testid={missionWorkspaceTestIds.homeLatitude}
        disabled={readOnly}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={() => {
          onSelect();
          beginDraft();
        }}
        onkeydown={handleEnter}
        oninput={(event) => {
          beginDraft();
          latitudeDraft = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={latitude}
      />
    </label>

    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Longitude</span>
      <input
        class="w-full rounded-lg border border-border bg-bg-secondary px-2.5 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
        data-testid={missionWorkspaceTestIds.homeLongitude}
        disabled={readOnly}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={() => {
          onSelect();
          beginDraft();
        }}
        onkeydown={handleEnter}
        oninput={(event) => {
          beginDraft();
          longitudeDraft = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={longitude}
      />
    </label>

    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Altitude (m)</span>
      <input
        class="w-full rounded-lg border border-border bg-bg-secondary px-2.5 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
        data-testid={missionWorkspaceTestIds.homeAltitude}
        disabled={readOnly}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={() => {
          onSelect();
          beginDraft();
        }}
        onkeydown={handleEnter}
        oninput={(event) => {
          beginDraft();
          altitudeDraft = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={altitude}
      />
    </label>
  </div>

  {#if visibleValidationMessage}
    <p class="mt-2 text-xs text-warning" data-testid={missionWorkspaceTestIds.homeValidation}>{visibleValidationMessage}</p>
  {/if}
</section>
