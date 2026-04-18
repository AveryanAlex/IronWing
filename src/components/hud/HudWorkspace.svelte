<script lang="ts">
import "./hud.css";
import { fromStore } from "svelte/store";

import ArtificialHorizon from "./ArtificialHorizon.svelte";
import TapeGauge from "./TapeGauge.svelte";
import HeadingTape from "./HeadingTape.svelte";
import {
  getOperatorWorkspaceViewStoreContext,
  getSessionViewStoreContext,
} from "../../app/shell/runtime-context";

const sessionView = fromStore(getSessionViewStoreContext());
const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());

let telemetry = $derived(sessionView.current.telemetry);
let view = $derived(operatorWorkspace.current);

let pitch = $derived(telemetry.pitch_deg ?? 0);
let roll = $derived(telemetry.roll_deg ?? 0);
let heading = $derived(telemetry.heading_deg ?? 0);
let altitude = $derived(telemetry.altitude_m ?? 0);
let speed = $derived(telemetry.speed_mps ?? 0);

let climbRateText = $derived(view.secondaryMetrics.climbRate.text);
let modeText = $derived(view.lifecycle.modeText);
let batteryText = $derived(view.primaryMetrics.battery.text);
let voltageText = $derived(view.secondaryMetrics.batteryVoltage.text);
let gpsText = $derived(view.primaryMetrics.gps.text);
let satellitesText = $derived(view.secondaryMetrics.satellites.text);

let wpDist = $derived(telemetry.wp_dist_m);
let wpDistText = $derived(wpDist != null ? `${Math.round(wpDist)} m` : "--");
</script>

<section class="hud-workspace">
  <!-- Row 1, Col 1: Waypoint info -->
  <div class="hud-readout" style="grid-area: 1 / 1 / 2 / 2;">
    <div class="hud-readout__label">WP DIST</div>
    <div class="hud-readout__value">{wpDistText}</div>
  </div>

  <!-- Row 1, Col 2: HeadingTape -->
  <div style="grid-area: 1 / 2 / 2 / 3; min-height: 50px;">
    <HeadingTape {heading} />
  </div>

  <!-- Row 1, Col 3: GPS info -->
  <div class="hud-readout" style="grid-area: 1 / 3 / 2 / 4; text-align: right;">
    <div class="hud-readout__label">GPS</div>
    <div class="hud-readout__value">{gpsText}</div>
    <div class="hud-readout__label" style="margin-top: 2px;">{satellitesText}</div>
  </div>

  <!-- Row 2, Col 1: Altitude tape -->
  <div style="grid-area: 2 / 1 / 3 / 2;">
    <TapeGauge value={altitude} side="left" />
  </div>

  <!-- Row 2, Col 2: Artificial horizon -->
  <div style="grid-area: 2 / 2 / 3 / 3;">
    <ArtificialHorizon {pitch} {roll} />
  </div>

  <!-- Row 2, Col 3: Speed tape -->
  <div style="grid-area: 2 / 3 / 3 / 4;">
    <TapeGauge value={speed} step={5} labelStep={10} side="right" />
  </div>

  <!-- Row 3, Col 1: Alt digital readout -->
  <div class="hud-readout hud-readout--cyan" style="grid-area: 3 / 1 / 4 / 2;">
    <div class="hud-readout__label">ALT</div>
    <div class="hud-readout__value">{altitude.toFixed(1)} m</div>
  </div>

  <!-- Row 3, Col 2: Mode + climb rate -->
  <div class="hud-readout" style="grid-area: 3 / 2 / 4 / 3; text-align: center;">
    <span class="hud-readout__value">{modeText}</span>
    <span class="hud-readout__label" style="margin-left: 12px;">VS {climbRateText}</span>
  </div>

  <!-- Row 3, Col 3: Battery info -->
  <div class="hud-readout" style="grid-area: 3 / 3 / 4 / 4; text-align: right;">
    <div class="hud-readout__label">BAT</div>
    <div class="hud-readout__value">{batteryText}</div>
    <div class="hud-readout__label" style="margin-top: 2px;">{voltageText}</div>
  </div>
</section>
