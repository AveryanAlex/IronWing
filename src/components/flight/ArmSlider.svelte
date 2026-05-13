<script lang="ts">
  import { fromStore } from "svelte/store";

  import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
  import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";
  import { armVehicle, disarmVehicle } from "../../telemetry";

  const sessionView = fromStore(getSessionViewStoreContext());

  let view = $derived(sessionView.current);
  let connected = $derived(view.connected);
  let vehicleState = $derived(view.vehicleStatusCard);
  let armed = $derived(vehicleState.armStateText === "ARMED");
  let replayReadonly = $derived(isReplayReadonly(view.activeSource));
  let locked = $derived(!connected || replayReadonly);

  let busy = $state(false);
  let commandError = $state<string | null>(null);

  async function handleArm() {
    if (armed || locked) return;
    busy = true;
    commandError = null;
    try {
      await armVehicle(false);
    } catch (error) {
      commandError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  async function handleDisarm() {
    if (!armed || locked) return;
    busy = true;
    commandError = null;
    try {
      await disarmVehicle(false);
    } catch (error) {
      commandError = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-lg border border-border bg-bg-primary p-3" class:opacity-50={locked}>
  {#if replayReadonly}
    <div class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-3 text-sm text-warning" data-testid="arm-replay-readonly-banner">
      <p class="font-semibold">{REPLAY_READONLY_TITLE}</p>
      <p class="mt-1">{REPLAY_READONLY_COPY}</p>
    </div>
  {/if}

  {#if commandError}
    <div class="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">{commandError}</div>
  {/if}

  <div class="flex items-center gap-2">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {armed ? "Armed" : "Disarmed"}
    </p>
  </div>

  <div class="mt-2" class:opacity-50={locked || busy} class:pointer-events-none={locked || busy}>
    <div class="relative flex h-9 rounded-full bg-bg-tertiary p-[3px]">
      <div
        class={[
          "absolute top-[3px] left-[3px] h-[calc(100%_-_6px)] w-[calc(50%_-_3px)] rounded-full bg-bg-secondary transition-[left,background] duration-200 ease-in-out",
          armed && "left-1/2 bg-danger/45",
        ]}
      ></div>
      <button
        class={[
          "relative z-[1] flex-1 rounded-full border-none bg-transparent text-xs font-semibold text-text-muted transition-colors duration-150 disabled:cursor-default",
          !armed && "text-text-primary",
        ]}
        disabled={!armed || locked || busy}
        onclick={handleDisarm}
        type="button"
      >
        Disarm
      </button>
      <button
        class={[
          "relative z-[1] flex-1 rounded-full border-none bg-transparent text-xs font-semibold text-text-muted transition-colors duration-150 disabled:cursor-default",
          armed && "text-text-primary",
        ]}
        disabled={armed || locked || busy}
        onclick={handleArm}
        type="button"
      >
        Arm
      </button>
    </div>
  </div>
</div>
