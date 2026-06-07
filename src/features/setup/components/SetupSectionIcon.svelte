<script lang="ts">
import {
  Activity,
  Battery,
  Box,
  Cable,
  Calculator,
  Cog,
  Compass,
  Fence,
  Home,
  LayoutDashboard,
  Lock,
  Navigation,
  Plane,
  Puzzle,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  SlidersVertical,
} from "lucide-svelte";

import type { SetupSectionId } from "../../../lib/setup-sections";

type Props = {
  sectionId: SetupSectionId;
  size?: number;
};

let { sectionId, size = 14 }: Props = $props();
</script>

{#if sectionId === "overview"}
  <LayoutDashboard {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "frame_orientation"}
  <Box {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "calibration"}
  <Compass {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "rc_receiver"}
  <Radio {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "navigation"}
  <Navigation {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "battery_monitor"}
  <Battery {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "motors_esc"}
  <Cog {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "servo_outputs"}
  <SlidersHorizontal {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "serial_ports"}
  <Cable {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "flight_modes"}
  <Plane {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "failsafe"}
  <ShieldAlert {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "rtl_return"}
  <Home {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "geofence"}
  <Fence {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "arming"}
  <Lock {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "initial_params"}
  <Calculator {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "pid_tuning"}
  <Activity {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "peripherals"}
  <Puzzle {size} class="shrink-0" aria-hidden="true" />
{:else if sectionId === "full_parameters"}
  <SlidersVertical {size} class="shrink-0" aria-hidden="true" />
{/if}
