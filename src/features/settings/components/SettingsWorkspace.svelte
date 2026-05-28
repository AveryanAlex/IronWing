<script lang="ts">
import { fromStore } from "svelte/store";

import { getLiveSettingsStoreContext } from "../../../app/shell/runtime-context";
import { trackAnalytics } from "../../../lib/analytics/client";
import { TELEMETRY_RATE_HZ_LIMITS } from "../../../lib/stores/settings";
import {
  ActionRow,
  Badge,
  FactTile,
  FieldRow,
  HelperText,
  Panel,
  SectionHeader,
  Slider,
  Switch,
  WorkspaceShell,
} from "../../../components/ui";

const SVS_STORAGE_KEY = "ironwing.hud.svs_enabled";

const liveSettingsStore = getLiveSettingsStoreContext();
const liveSettings = fromStore(liveSettingsStore);

let svsEnabled = $state(loadSvsEnabled());

let telemetryRateHz = $derived(liveSettings.current.draft.telemetryRateHz);

function loadSvsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SVS_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function handleRateChange(value: number) {
  if (Number.isNaN(value)) return;

  liveSettingsStore.stageTelemetryRate(value);
  trackAnalytics("telemetry_rate_changed", { rate_hz: value });
  trackAnalytics("settings_changed", { setting: "telemetry_rate_hz", value_bucket: `${value}_hz` });
  void liveSettingsStore.applyDrafts();
}

function handleSvsToggle(checked: boolean) {
  svsEnabled = checked;
  trackAnalytics("hud_svs_toggled", { enabled: svsEnabled ? 1 : 0 });
  trackAnalytics("settings_changed", { setting: "hud_svs", value_bucket: svsEnabled ? "enabled" : "disabled" });
  try {
    localStorage.setItem(SVS_STORAGE_KEY, String(svsEnabled));
  } catch {
    // Storage quota exceeded or unavailable in this environment
    console.warn("Failed to persist SVS setting to localStorage");
  }
}
</script>

<WorkspaceShell mode="inset">
  <Panel>
    <SectionHeader eyebrow="Runtime" title="Telemetry & runtime" description="Live shell behavior staged through the shared settings store." />
    <FieldRow
      label="Telemetry update rate"
      description="How frequently telemetry is requested from the vehicle."
    >
      {#snippet control()}
        <ActionRow align="stretch" class="w-full sm:min-w-72">
          <Slider
            ariaLabel="Telemetry update rate"
            max={TELEMETRY_RATE_HZ_LIMITS.max}
            min={TELEMETRY_RATE_HZ_LIMITS.min}
            onValueChange={handleRateChange}
            showValue
            step={1}
            unit=" Hz"
            value={telemetryRateHz}
          />
          <FactTile label="Draft" value={telemetryRateHz} unit="Hz" density="compact" />
        </ActionRow>
      {/snippet}
    </FieldRow>
  </Panel>

  <Panel>
    <SectionHeader eyebrow="Display" title="Flight display" description="Operator-facing display preferences stored locally on this workstation." />
    <FieldRow
      label="Synthetic Vision System"
      description="Show 3D terrain behind the HUD horizon line."
    >
      {#snippet control()}
        <ActionRow align="end" class="w-full sm:min-w-48">
          <Badge variant={svsEnabled ? "success" : "muted"} size="sm" case="normal" shape="rounded">
            {svsEnabled ? "Enabled" : "Disabled"}
          </Badge>
          <Switch checked={svsEnabled} onCheckedChange={handleSvsToggle} />
        </ActionRow>
      {/snippet}
    </FieldRow>
    <HelperText size="xs" tone="muted" class="mt-3">Display preferences are local to this browser or Tauri profile.</HelperText>
  </Panel>
</WorkspaceShell>
