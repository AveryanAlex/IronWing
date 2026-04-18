<script lang="ts">
import ConnectionPanel from "../../components/connection/ConnectionPanel.svelte";
import FlightControlsPanel from "../../components/flight/FlightControlsPanel.svelte";
import ArmSlider from "../../components/flight/ArmSlider.svelte";
import VehicleSidebarTelemetry from "./VehicleSidebarTelemetry.svelte";
</script>

<div class="app-shell-vehicle-stack">
  <ConnectionPanel />
  <VehicleSidebarTelemetry />
  <FlightControlsPanel />
  <ArmSlider />
</div>
