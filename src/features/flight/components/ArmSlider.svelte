<script lang="ts">
  import { Shield } from "lucide-svelte";
  import { fromStore } from "svelte/store";

  import { getSessionViewStoreContext } from "../../../app/shell/runtime-context";
  import { Alert, Button, Card, Eyebrow } from "../../../components/ui";
  import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../../lib/replay-readonly";
  import { armVehicle, disarmVehicle } from "../../../telemetry";

  const sessionView = fromStore(getSessionViewStoreContext());
  const sliderButtonClass = "relative z-[1] min-w-0 flex-1 px-2 text-xs font-semibold text-text-muted transition-colors duration-150 disabled:cursor-default disabled:opacity-100";

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

<Card.Root density="compact" surface="primary" gap="none" class={locked ? "opacity-50" : undefined}>
  {#if replayReadonly}
    <Alert class="mb-3" variant="warning" density="compact" title={REPLAY_READONLY_TITLE} description={REPLAY_READONLY_COPY} testId="arm-replay-readonly-banner" />
  {/if}

  {#if commandError}
    <Alert class="mb-3" variant="danger" density="compact" description={commandError} />
  {/if}

  <Eyebrow class="flex items-center gap-2">
    <Shield aria-hidden="true" class="text-text-muted" size={14} />
    {armed ? "Armed" : "Disarmed"}
  </Eyebrow>

  <div class="mt-2" class:opacity-50={locked || busy} class:pointer-events-none={locked || busy}>
    <div class="relative flex h-9 rounded-lg border border-border bg-bg-secondary p-0.5" aria-label="Arm state command" data-testid="arm-state-slider" role="group">
      <div
        class={[
          "absolute top-0.5 h-[calc(100%_-_4px)] w-[calc(50%_-_2px)] rounded-md border shadow-sm transition-[left,background,border-color] duration-200 ease-in-out",
          armed ? "left-1/2 border-danger/40 bg-danger/45" : "left-0.5 border-border-light bg-bg-primary",
        ]}
        data-testid="arm-state-slider-thumb"
      ></div>
      <Button
        variant="bare"
        size="sm"
        class={`${sliderButtonClass} ${!armed ? "text-text-primary" : ""}`}
        aria-pressed={!armed}
        data-active={!armed || undefined}
        disabled={!armed || locked || busy}
        onclick={handleDisarm}
        type="button"
      >
        Disarm
      </Button>
      <Button
        variant="bare"
        size="sm"
        class={`${sliderButtonClass} ${armed ? "text-text-primary" : ""}`}
        aria-pressed={armed}
        data-active={armed || undefined}
        tone={armed ? "danger" : undefined}
        disabled={armed || locked || busy}
        onclick={handleArm}
        type="button"
      >
        Arm
      </Button>
    </div>
  </div>
</Card.Root>
