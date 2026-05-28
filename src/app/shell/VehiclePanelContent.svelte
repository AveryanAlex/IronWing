<script lang="ts">
import ConnectionPanel from "../../features/connection/components/ConnectionPanel.svelte";
import FlightControlsPanel from "../../features/flight/components/FlightControlsPanel.svelte";
import ArmSlider from "../../features/flight/components/ArmSlider.svelte";
import VehicleSidebarTelemetry from "./VehicleSidebarTelemetry.svelte";
</script>

<div class="app-shell-vehicle-stack">
  <ConnectionPanel />
  <VehicleSidebarTelemetry />
  <FlightControlsPanel />
  <ArmSlider />
</div>
