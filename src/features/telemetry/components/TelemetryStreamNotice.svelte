<script lang="ts">
import { Radio } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { Alert, Button } from "../../../components/ui";
import type { SourceKind } from "../../../session";
import {
  PWM_TELEMETRY_RATE_HZ,
  resolveTelemetryStreamControl,
} from "../../../lib/telemetry-stream-control";
import {
  getLiveSettingsStoreContext,
  getTelemetrySettingsDialogLauncherContext,
} from "../../../app/shell/runtime-context";

type Props = {
  activeSource: SourceKind | null;
  available: boolean;
  connected: boolean;
  messageIds: readonly number[];
  streamLabel: string;
  testId?: string;
  class?: string;
};

let {
  activeSource,
  available,
  connected,
  messageIds,
  streamLabel,
  testId,
  class: className,
}: Props = $props();

const liveSettingsStore = getLiveSettingsStoreContext();
const telemetrySettingsDialog = getTelemetrySettingsDialogLauncherContext();
const liveSettings = fromStore(liveSettingsStore);

let state = $derived(liveSettings.current);
let control = $derived(resolveTelemetryStreamControl({
  activeSource,
  available,
  connected,
  messageIds,
  settings: state,
}));
let globalApplyBusy = $derived(state.applyPhase === "applying" && control.kind !== "enabling");
let title = $derived.by(() => {
  switch (control.kind) {
    case "enabling":
      return `Enabling ${streamLabel}…`;
    case "waiting":
      return `${streamLabel} requested`;
    case "failed":
      return `Could not enable ${streamLabel}`;
    case "disconnected":
      return `${streamLabel} needs a live connection`;
    case "playback":
      return `${streamLabel} is unavailable in playback`;
    default:
      return `${streamLabel} is not streaming`;
  }
});
let description = $derived.by(() => {
  switch (control.kind) {
    case "enabling":
      return `Requesting ${PWM_TELEMETRY_RATE_HZ} Hz from the vehicle and saving it for future connections.`;
    case "waiting":
      return `IronWing requested ${PWM_TELEMETRY_RATE_HZ} Hz, but no samples have arrived yet. Retry the request or review telemetry controls.`;
    case "failed":
      return control.error ?? "The vehicle rejected the stream-rate request.";
    case "disconnected":
      return "Reconnect the live vehicle before requesting this telemetry stream.";
    case "playback":
      return "Message-rate requests are available only for a connected live vehicle.";
    default:
      return `ArduPilot often leaves this stream disabled. Request ${PWM_TELEMETRY_RATE_HZ} Hz now and remember it for future connections.`;
  }
});

async function enableStreams() {
  await liveSettingsStore.enableMessageRates(messageIds, PWM_TELEMETRY_RATE_HZ);
}
</script>

{#if control.kind !== "live"}
  {#snippet noticeIcon()}
    <Radio aria-hidden="true" size={16} />
  {/snippet}

  {#snippet noticeAction()}
    <div class="flex flex-wrap justify-end gap-2">
      {#if control.kind === "enable" || control.kind === "waiting" || control.kind === "failed" || control.kind === "enabling"}
        <Button
          disabled={globalApplyBusy}
          loading={control.kind === "enabling"}
          onclick={() => void enableStreams()}
          size="sm"
          variant="secondary"
        >
          {control.kind === "enable" ? `Enable ${PWM_TELEMETRY_RATE_HZ} Hz` : "Retry request"}
        </Button>
      {/if}
      <Button onclick={() => telemetrySettingsDialog.open()} size="sm" variant="ghost">Controls</Button>
    </div>
  {/snippet}

  <Alert
    action={noticeAction}
    class={className}
    description={description}
    icon={noticeIcon}
    layout="row"
    role={control.kind === "failed" ? "alert" : "status"}
    testId={testId}
    title={title}
    variant={control.kind === "failed" ? "danger" : "warning"}
  />
{/if}
