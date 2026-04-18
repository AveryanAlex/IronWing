<script lang="ts">
  import { fromStore } from "svelte/store";

  import { getSessionViewStoreContext } from "../../app/shell/runtime-context";
  import { armVehicle, disarmVehicle } from "../../telemetry";

  const sessionView = fromStore(getSessionViewStoreContext());

  let view = $derived(sessionView.current);
  let connected = $derived(view.connected);
  let vehicleState = $derived(view.vehicleStatusCard);
  let armed = $derived(vehicleState.armStateText === "ARMED");
  let locked = $derived(!connected);

  let busy = $state(false);

  async function handleArm() {
    if (armed || locked) return;
    busy = true;
    try {
      await armVehicle(false);
    } finally {
      busy = false;
    }
  }

  async function handleDisarm() {
    if (!armed || locked) return;
    busy = true;
    try {
      await disarmVehicle(false);
    } finally {
      busy = false;
    }
  }
</script>

<div class="rounded-lg border border-border bg-bg-primary p-3" class:opacity-50={locked}>
  <div class="flex items-center gap-2">
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-muted">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </svg>
    <p class="text-xs font-semibold uppercase tracking-[0.12em] text-text-muted">
      {armed ? "Armed" : "Disarmed"}
    </p>
  </div>

  <div class="arm-slider" class:arm-slider--locked={locked || busy}>
    <div class="arm-slider__track">
      <div
        class="arm-slider__pill"
        class:arm-slider__pill--armed={armed}
      ></div>
      <button
        class="arm-slider__btn"
        class:arm-slider__btn--active={!armed}
        disabled={!armed || locked || busy}
        onclick={handleDisarm}
        type="button"
      >
        Disarm
      </button>
      <button
        class="arm-slider__btn"
        class:arm-slider__btn--active={armed}
        disabled={armed || locked || busy}
        onclick={handleArm}
        type="button"
      >
        Arm
      </button>
    </div>
  </div>
</div>

<style>
  .arm-slider {
    margin-top: 8px;
  }

  .arm-slider--locked {
    pointer-events: none;
    opacity: 0.5;
  }

  .arm-slider__track {
    position: relative;
    display: flex;
    height: 36px;
    border-radius: 999px;
    background: var(--color-bg-tertiary);
    padding: 3px;
  }

  .arm-slider__pill {
    position: absolute;
    top: 3px;
    left: 3px;
    width: calc(50% - 3px);
    height: calc(100% - 6px);
    border-radius: 999px;
    background: var(--color-bg-secondary);
    transition: left 0.2s ease, background 0.2s ease;
  }

  .arm-slider__pill--armed {
    left: 50%;
    background: rgba(255, 68, 68, 0.45);
  }

  .arm-slider__btn {
    position: relative;
    z-index: 1;
    flex: 1;
    border: none;
    border-radius: 999px;
    background: transparent;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s;
    color: var(--color-text-muted);
  }

  .arm-slider__btn--active {
    color: var(--color-text-primary);
  }

  .arm-slider__btn:disabled {
    cursor: default;
  }
</style>
