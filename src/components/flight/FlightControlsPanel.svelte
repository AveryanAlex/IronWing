<script lang="ts">
  import { onMount } from "svelte";
  import { fromStore } from "svelte/store";

  import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
  import {
    getAvailableModes,
    setFlightMode,
    type FlightModeEntry,
  } from "../../telemetry";
  import { guidedTakeoff } from "../../guided";
  import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";

  const sessionView = fromStore(getSessionViewStoreContext());

  let view = $derived(sessionView.current);
  let connected = $derived(view.connected);
  let vehicleState = $derived(view.vehicleStatusCard);
  let armed = $derived(vehicleState.armStateText === "ARMED");
  let currentModeName = $derived(vehicleState.modeText);

  let availableModes = $state<FlightModeEntry[]>([]);
  let takeoffAlt = $state(10);
  let busy = $state(false);
  let commandError = $state<string | null>(null);

  const QUICK_MODES = ["RTL", "LAND", "LOITER"] as const;

  onMount(() => {
    void loadModes();
  });

  $effect(() => {
    if (connected) {
      void loadModes();
    } else {
      availableModes = [];
    }
  });

  async function loadModes() {
    try {
      availableModes = await getAvailableModes();
    } catch {
      availableModes = [];
    }
  }

  async function handleModeChange(e: Event) {
    const customMode = Number((e.target as HTMLSelectElement).value);
    if (!Number.isFinite(customMode)) return;
    busy = true;
    commandError = null;
    try {
      await setFlightMode(customMode);
    } catch (error) {
      commandError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function handleTakeoff() {
    if (takeoffAlt <= 0) return;
    busy = true;
    commandError = null;
    try {
      await guidedTakeoff(takeoffAlt);
    } catch (error) {
      commandError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function handleQuickMode(modeName: string) {
    const entry = availableModes.find(
      (m) => m.name.toUpperCase() === modeName.toUpperCase(),
    );
    if (!entry) return;
    busy = true;
    commandError = null;
    try {
      await setFlightMode(entry.custom_mode);
    } catch (error) {
      commandError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  let currentModeCustom = $derived(
    availableModes.find(
      (m) => m.name.toUpperCase() === currentModeName.toUpperCase(),
    )?.custom_mode ?? -1,
  );

  let quickModes = $derived(
    QUICK_MODES.filter((name) =>
      availableModes.some((m) => m.name.toUpperCase() === name),
    ),
  );

  let canTakeoff = $derived(
    connected && armed && currentModeName.toUpperCase() === "GUIDED",
  );
  let replayReadonly = $derived(isReplayReadonly(view.activeSource));
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3">
  <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
    Controls
  </p>

  {#if replayReadonly}
    <div class="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning" data-testid="flight-replay-readonly-banner">
      <p class="font-semibold">{REPLAY_READONLY_TITLE}</p>
      <p class="mt-1">{REPLAY_READONLY_COPY}</p>
    </div>
  {/if}

  {#if commandError}
    <div class="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">{commandError}</div>
  {/if}

  <div class="mt-3 space-y-3">
    <!-- Flight mode selector -->
    <div>
      <label
        class="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-text-muted"
        for="flight-mode-select"
      >
        Flight mode
      </label>
      <select
        id="flight-mode-select"
        class="mt-1 w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!connected || busy || replayReadonly}
        value={currentModeCustom}
        onchange={handleModeChange}
      >
        {#if availableModes.length === 0}
          <option value="-1">{currentModeName || "--"}</option>
        {/if}
        {#each availableModes as mode (mode.custom_mode)}
          <option value={mode.custom_mode}>{mode.name}</option>
        {/each}
      </select>
    </div>

    <!-- Takeoff -->
    <div>
      <label
        class="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-text-muted"
        for="takeoff-alt"
      >
        Takeoff altitude
      </label>
      <div class="mt-1 flex gap-2">
        <div class="flex flex-1 items-center gap-1">
          <input
            id="takeoff-alt"
            type="number"
            min="1"
            max="500"
            step="1"
            class="w-full rounded-md border border-border bg-bg-input px-2 py-1.5 text-sm text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canTakeoff || busy || replayReadonly}
            bind:value={takeoffAlt}
          />
          <span class="text-xs text-text-muted">m</span>
        </div>
        <button
          class="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-primary transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canTakeoff || busy || replayReadonly}
          onclick={handleTakeoff}
          type="button"
        >
          Takeoff
        </button>
      </div>
    </div>

    <!-- Quick mode buttons -->
    {#if quickModes.length > 0}
      <div class="flex gap-2">
        {#each quickModes as modeName (modeName)}
          <button
            class="flex-1 rounded-md border border-border bg-bg-secondary px-2 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!connected || busy || replayReadonly}
            onclick={() => handleQuickMode(modeName)}
            type="button"
          >
            {modeName}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>
