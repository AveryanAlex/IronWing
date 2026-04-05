<script lang="ts">
import type { HomePosition } from "../../mission";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  home: HomePosition | null;
  selected: boolean;
  onSelect: () => void;
  onChange: (home: HomePosition | null) => void;
};

let { home, selected, onSelect, onChange }: Props = $props();

let latitude = $state("");
let longitude = $state("");
let altitude = $state("");
let validationMessage = $state<string | null>(null);

let syncKey = $derived(home ? `${home.latitude_deg}:${home.longitude_deg}:${home.altitude_m}` : "no-home");

$effect(() => {
  syncKey;
  latitude = home ? String(home.latitude_deg) : "";
  longitude = home ? String(home.longitude_deg) : "";
  altitude = home ? String(home.altitude_m) : "";
  validationMessage = null;
});

function commitHome() {
  const trimmed = {
    latitude: latitude.trim(),
    longitude: longitude.trim(),
    altitude: altitude.trim(),
  };

  if (!trimmed.latitude && !trimmed.longitude && !trimmed.altitude) {
    validationMessage = null;
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

  validationMessage = null;
  onChange({
    latitude_deg: nextLatitude,
    longitude_deg: nextLongitude,
    altitude_m: nextAltitude,
  });
}

function clearHome() {
  latitude = "";
  longitude = "";
  altitude = "";
  validationMessage = null;
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
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Home</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Planner home position</h3>
      <p class="mt-1 text-xs text-text-secondary" data-testid={missionWorkspaceTestIds.homeSummary}>
        {home
          ? `${home.latitude_deg.toFixed(5)}, ${home.longitude_deg.toFixed(5)} · ${home.altitude_m.toFixed(1)} m`
          : "Set a Home position explicitly for this draft; incomplete values stay local until all three fields are valid."}
      </p>
    </div>

    <button
      class="rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
      data-testid={missionWorkspaceTestIds.homeClear}
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
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        data-testid={missionWorkspaceTestIds.homeLatitude}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={onSelect}
        onkeydown={handleEnter}
        oninput={(event) => {
          latitude = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={latitude}
      />
    </label>

    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Longitude</span>
      <input
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        data-testid={missionWorkspaceTestIds.homeLongitude}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={onSelect}
        onkeydown={handleEnter}
        oninput={(event) => {
          longitude = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={longitude}
      />
    </label>

    <label class="space-y-1">
      <span class="text-xs font-medium text-text-muted">Altitude (m)</span>
      <input
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        data-testid={missionWorkspaceTestIds.homeAltitude}
        inputmode="decimal"
        onblur={commitHome}
        onfocus={onSelect}
        onkeydown={handleEnter}
        oninput={(event) => {
          altitude = (event.currentTarget as HTMLInputElement).value;
        }}
        type="text"
        value={altitude}
      />
    </label>
  </div>

  {#if validationMessage}
    <p class="mt-3 text-xs text-warning" data-testid={missionWorkspaceTestIds.homeValidation}>{validationMessage}</p>
  {/if}
</section>
