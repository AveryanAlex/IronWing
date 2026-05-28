<script lang="ts">
import { Home as HomeIcon } from "lucide-svelte";
import type { HomePosition } from "../../../mission";
import type { MissionPlannerAttachmentState } from "../../../lib/stores/mission-planner";
import { Badge, Card, ExternalLink, Eyebrow, HelperText, Input, MonoValue } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

const ARDUPILOT_HOME_POSITION_DOCS_URL = "https://ardupilot.org/copter/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-set-home";

type Props = {
  home: HomePosition | null;
  selected: boolean;
  attachment: MissionPlannerAttachmentState;
  onSelect: () => void;
  onChange: (home: HomePosition | null) => void;
};

let { home, selected, attachment, onSelect, onChange }: Props = $props();

let validationMessage = $state<string | null>(null);
let draftSourceKey = $state<string | null>(null);
let latitudeDraft = $state<string | null>(null);
let longitudeDraft = $state<string | null>(null);
let altitudeDraft = $state<string | null>(null);

let syncKey = $derived(home ? `${home.latitude_deg}:${home.longitude_deg}:${home.altitude_m}` : "no-home");
let readOnly = $derived(!attachment.canEdit);
let readOnlyMessage = $derived(readOnly ? attachment.detail : null);
let baseLatitude = $derived(home ? String(home.latitude_deg) : "");
let baseLongitude = $derived(home ? String(home.longitude_deg) : "");
let baseAltitude = $derived(home ? String(home.altitude_m) : "");
let latitude = $derived(draftSourceKey === syncKey && latitudeDraft !== null ? latitudeDraft : baseLatitude);
let longitude = $derived(draftSourceKey === syncKey && longitudeDraft !== null ? longitudeDraft : baseLongitude);
let altitude = $derived(draftSourceKey === syncKey && altitudeDraft !== null ? altitudeDraft : baseAltitude);
let visibleValidationMessage = $derived(draftSourceKey === syncKey ? validationMessage : null);
let homeSummary = $derived(home ? `${home.latitude_deg.toFixed(5)}, ${home.longitude_deg.toFixed(5)} · ${home.altitude_m.toFixed(1)} m` : null);

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

function handleEnter(event: KeyboardEvent) {
  if (event.key === "Enter") {
    (event.currentTarget as HTMLInputElement).blur();
  }
}
</script>

<div data-selected={selected ? "true" : "false"}>
  <Card.Root as="section" density="compact" selected={selected} surface="panel" testId={missionWorkspaceTestIds.homeCard}>
    <header class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent" aria-hidden="true">
          <HomeIcon size={16} />
        </span>
        <Eyebrow as="h3">HOME POSITION</Eyebrow>
      </div>
      <ExternalLink
        class="text-xs font-semibold"
        testId={missionWorkspaceTestIds.homeDocsLink}
        href={ARDUPILOT_HOME_POSITION_DOCS_URL}
      >
        ArduPilot docs
      </ExternalLink>
    </header>

    {#if homeSummary}
      <MonoValue
        as="p"
        class="mt-2 mb-0 text-sm leading-snug text-text-secondary"
        testId={missionWorkspaceTestIds.homeSummary}
        value={homeSummary}
      >
      </MonoValue>
    {/if}

    {#if readOnlyMessage}
      <Badge testId={missionWorkspaceTestIds.homeReadOnly} variant="warning" size="sm" case="normal" shape="rounded">{readOnlyMessage}</Badge>
    {/if}

    <div class="mt-2 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-bold uppercase tracking-wide text-text-muted">Latitude</span>
        <Input
          testId={missionWorkspaceTestIds.homeLatitude}
          disabled={readOnly}
          invalid={visibleValidationMessage !== null}
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
          size="sm"
          type="text"
          value={latitude}
        />
      </label>
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-bold uppercase tracking-wide text-text-muted">Longitude</span>
        <Input
          testId={missionWorkspaceTestIds.homeLongitude}
          disabled={readOnly}
          invalid={visibleValidationMessage !== null}
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
          size="sm"
          type="text"
          value={longitude}
        />
      </label>
      <label class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-bold uppercase tracking-wide text-text-muted">Altitude (m)</span>
        <Input
          testId={missionWorkspaceTestIds.homeAltitude}
          disabled={readOnly}
          invalid={visibleValidationMessage !== null}
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
          size="sm"
          type="text"
          value={altitude}
        />
      </label>
    </div>

    {#if visibleValidationMessage}
      <HelperText
        class="mt-2 mb-0 text-sm text-warning"
        tone="warning"
        testId={missionWorkspaceTestIds.homeValidation}
      >
        {visibleValidationMessage}
      </HelperText>
    {/if}
  </Card.Root>
</div>
