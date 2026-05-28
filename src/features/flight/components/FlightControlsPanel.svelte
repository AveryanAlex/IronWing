<script lang="ts">
  import { Navigation } from "lucide-svelte";
  import { onMount } from "svelte";
  import { fromStore } from "svelte/store";

  import { getSessionViewStoreContext } from "../../../app/shell/runtime-context";
  import { Alert, Button, Card, Eyebrow, NativeSelect, NumberInput } from "../../../components/ui";
  import {
    getAvailableModes,
    setFlightMode,
    type FlightModeEntry,
  } from "../../../telemetry";
  import { guidedTakeoff } from "../../../guided";
  import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../lib/replay-readonly";

  const sessionView = fromStore(getSessionViewStoreContext());

  let view = $derived(sessionView.current);
  let connected = $derived(view.connected);
  let vehicleStatusCard = $derived(view.vehicleStatusCard);
  let vehicleState = $derived(view.vehicleState);
  let armed = $derived(vehicleStatusCard.armStateText === "ARMED");
  let currentModeName = $derived(vehicleStatusCard.modeText);

  let availableModes = $state<FlightModeEntry[]>([]);
  let takeoffAlt = $state(10);
  let busy = $state(false);
  let commandError = $state<string | null>(null);

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
    const selectedValue = (e.currentTarget as HTMLSelectElement).value;
    if (selectedValue === "") return;

    const customMode = Number(selectedValue);
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

  let currentModeValue = $derived.by(() => {
    if (!connected || vehicleState == null || !Number.isFinite(vehicleState.custom_mode)) {
      return "";
    }

    return String(vehicleState.custom_mode);
  });
  let currentModeLabel = $derived(currentModeName && currentModeName !== "--" ? currentModeName : "--");
  let currentModeListed = $derived(
    currentModeValue !== "" && availableModes.some((mode) => String(mode.custom_mode) === currentModeValue),
  );

  let canTakeoff = $derived(
    connected && armed && currentModeName.toUpperCase() === "GUIDED",
  );
  let replayReadonly = $derived(isReplayReadonly(view.activeSource));
</script>

<Card.Root as="section" gap="none" density="compact" surface="primary">
  <Eyebrow class="flex items-center gap-1.5">
    <Navigation aria-hidden="true" size={14} />
    Controls
  </Eyebrow>

  {#if replayReadonly}
    <Alert class="mt-3" variant="warning" density="compact" title={REPLAY_READONLY_TITLE} description={REPLAY_READONLY_COPY} testId="flight-replay-readonly-banner" />
  {/if}

  {#if commandError}
    <Alert class="mt-3" variant="danger" density="compact" description={commandError} />
  {/if}

  <div class="mt-3 space-y-3">
    <!-- Flight mode selector -->
    <div>
      <label for="flight-mode-select">
        <Eyebrow as="span">Flight mode</Eyebrow>
      </label>
      <NativeSelect
        id="flight-mode-select"
        class="mt-1"
        disabled={!connected || busy || replayReadonly}
        value={currentModeValue}
        onchange={handleModeChange}
      >
        {#if currentModeValue !== "" && !currentModeListed}
          <option value={currentModeValue}>{currentModeLabel}</option>
        {:else if availableModes.length === 0}
          <option value="">{currentModeLabel}</option>
        {/if}
        {#each availableModes as mode (mode.custom_mode)}
          <option value={String(mode.custom_mode)}>{mode.name}</option>
        {/each}
      </NativeSelect>
    </div>

    <!-- Takeoff -->
    <div>
      <label for="takeoff-alt">
        <Eyebrow as="span">Takeoff altitude</Eyebrow>
      </label>
      <div class="mt-1 flex gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-1">
          <NumberInput
            id="takeoff-alt"
            min="1"
            max="500"
            step="1"
            unit="m"
            disabled={!canTakeoff || busy || replayReadonly}
            bind:value={takeoffAlt}
          />
        </div>
        <Button
          disabled={!canTakeoff || busy || replayReadonly}
          onclick={handleTakeoff}
        >
          Takeoff
        </Button>
      </div>
    </div>
  </div>
</Card.Root>
