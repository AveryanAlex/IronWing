<script lang="ts">
import { fromStore, readable, type Readable } from "svelte/store";

import type { HomePosition } from "../../mission";
import type { MissionPlannerAttachmentState, MissionPlannerMode } from "../../lib/stores/mission-planner";
import type { ShellChromeState } from "../../app/shell/chrome-state";
import { getShellChromeStoreContext } from "../../app/shell/runtime-context";
import { Badge, Button, FieldRow, InfoWidget, Panel, SectionHeader } from "../ui";
import { missionWorkspaceFallbackChromeState } from "./mission-workspace-layout";
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

function resolveChromeStore(): Readable<ShellChromeState> {
  try {
    return getShellChromeStoreContext();
  } catch {
    return readable(missionWorkspaceFallbackChromeState);
  }
}

const chrome = fromStore(resolveChromeStore());
let isPhone = $derived(chrome.current.tier === "phone");

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
let homeStatusLabel = $derived(home ? "Home set" : "Home not set");
let homeSummary = $derived(
  home
    ? `${home.latitude_deg.toFixed(5)}, ${home.longitude_deg.toFixed(5)} · ${home.altitude_m.toFixed(1)} m`
    : `Set a Home position explicitly for this ${modeLabel} draft; incomplete values stay local until all three fields are valid.`,
);

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

<div
  class="mission-home"
  class:is-selected={selected}
  data-selected={selected ? "true" : "false"}
>
  <Panel testId={missionWorkspaceTestIds.homeCard}>
    <header class="mission-home__header">
      <SectionHeader eyebrow="Home" title={homeStatusLabel}>
        {#snippet actions()}
          <Button
            disabled={readOnly}
            onclick={() => {
              onSelect();
              clearHome();
            }}
            size="sm"
            testId={missionWorkspaceTestIds.homeClear}
            tone="neutral"
          >
            Clear
          </Button>
        {/snippet}
      </SectionHeader>
      <div class="mission-home__info">
        <InfoWidget
          align="right"
          contentTestId={missionWorkspaceTestIds.homeSync}
          description={homeInfoDescription}
          panelTestId={missionWorkspaceTestIds.homeInfoPopup}
          testId={missionWorkspaceTestIds.homeInfoButton}
          title="Shared planning context"
        />
      </div>
    </header>

    <p class="mission-home__summary" data-testid={missionWorkspaceTestIds.homeSummary}>
      {homeSummary}
    </p>

    {#if readOnlyMessage}
      <Badge testId={missionWorkspaceTestIds.homeReadOnly} tone="warning">{readOnlyMessage}</Badge>
    {/if}

    {#if isPhone}
      <div class="mission-home__row mission-home__row--compact">
        <label class="mission-home__field">
          <span>Lat</span>
          <input
            class="mission-home__input"
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
        <label class="mission-home__field">
          <span>Lon</span>
          <input
            class="mission-home__input"
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
        <label class="mission-home__field">
          <span>Alt</span>
          <input
            class="mission-home__input"
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
    {:else}
      <FieldRow label="Latitude" layout="row">
        {#snippet control()}
          <input
            class="mission-home__input"
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
        {/snippet}
      </FieldRow>
      <FieldRow label="Longitude" layout="row">
        {#snippet control()}
          <input
            class="mission-home__input"
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
        {/snippet}
      </FieldRow>
      <FieldRow label="Altitude (m)" layout="row">
        {#snippet control()}
          <input
            class="mission-home__input"
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
        {/snippet}
      </FieldRow>
    {/if}

    {#if visibleValidationMessage}
      <p class="mission-home__validation" data-testid={missionWorkspaceTestIds.homeValidation}>
        {visibleValidationMessage}
      </p>
    {/if}
  </Panel>
</div>

<style>
.mission-home {
  border-radius: var(--radius-md);
}
.mission-home.is-selected :global(.ui-panel) {
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
  background: color-mix(in srgb, var(--color-accent) 10%, var(--surface-panel));
}
.mission-home__header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  justify-content: space-between;
}
.mission-home__info {
  flex-shrink: 0;
  padding-top: 2px;
}
.mission-home__summary {
  margin: var(--space-2) 0 0;
  color: var(--color-text-secondary);
  font-size: 0.78rem;
  line-height: 1.45;
}
.mission-home__row {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.mission-home__field {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-width: 0;
  gap: 4px;
}
.mission-home__field span {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.mission-home__input {
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 0.86rem;
}
.mission-home__input:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.mission-home__validation {
  margin: var(--space-2) 0 0;
  color: var(--color-warning);
  font-size: 0.78rem;
}
</style>
