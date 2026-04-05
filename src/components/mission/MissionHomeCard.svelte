<script lang="ts">
import type { HomePosition } from "../../mission";
import type { MissionPlannerAttachmentState, MissionPlannerMode } from "../../lib/stores/mission-planner";
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
  class={`rounded-2xl border p-4 transition ${selected
    ? "border-accent/40 bg-accent/10"
    : "border-border bg-bg-primary"}`}
  data-selected={selected ? "true" : "false"}
  data-testid={missionWorkspaceTestIds.homeCard}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="max-w-2xl">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Shared Home</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Home marker across mission, fence, and rally</h3>
      <p class="mt-1 text-xs text-text-secondary" data-testid={missionWorkspaceTestIds.homeSummary}>
        {home
          ? `${home.latitude_deg.toFixed(5)}, ${home.longitude_deg.toFixed(5)} · ${home.altitude_m.toFixed(1)} m`
          : `Set a Home position explicitly for this ${modeLabel} draft; incomplete values stay local until all three fields are valid.`}
      </p>
      <p class="mt-2 text-xs text-text-secondary" data-testid={missionWorkspaceTestIds.homeSync}>
        Mission reads can refresh Home, but mission / fence / rally upload and clear flows do not sync Home automatically. Treat Home as shared planning context, not an exportable domain of its own.
      </p>
      {#if readOnlyMessage}
        <p class="mt-2 text-xs text-warning" data-testid={missionWorkspaceTestIds.homeReadOnly}>{readOnlyMessage}</p>
      {/if}
    </div>

    <button
      class="rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.homeClear}
      disabled={readOnly}
      onclick={() => {
        onSelect();
        clearHome();
      }}
      type="button"
    >
      Clear Home
    </button>
  </div>

  <div class="mt-4 grid gap-3 md:grid-cols-3">
    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Latitude</span>
      <input
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
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
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
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
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-70"
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
    <p class="mt-3 text-xs text-warning" data-testid={missionWorkspaceTestIds.homeValidation}>{visibleValidationMessage}</p>
  {/if}
</section>
