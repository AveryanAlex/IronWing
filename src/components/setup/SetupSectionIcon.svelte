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
  Plane,
  Puzzle,
  Radio,
  Satellite,
  ShieldAlert,
  SlidersHorizontal,
  SlidersVertical,
  Sparkles,
} from "lucide-svelte";

import type { SetupSectionId } from "../../lib/setup-sections";

type Props = {
  sectionId: SetupSectionId;
  size?: number;
  class?: string;
};

let { sectionId, size = 14, class: className = "" }: Props = $props();

const iconClass = $derived(["shrink-0", className].filter(Boolean).join(" "));
</script>

{#if sectionId === "overview"}
  <LayoutDashboard {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "beginner_wizard"}
  <Sparkles {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "frame_orientation"}
  <Box {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "calibration"}
  <Compass {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "rc_receiver"}
  <Radio {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "gps"}
  <Satellite {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "battery_monitor"}
  <Battery {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "motors_esc"}
  <Cog {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "servo_outputs"}
  <SlidersHorizontal {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "serial_ports"}
  <Cable {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "flight_modes"}
  <Plane {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "failsafe"}
  <ShieldAlert {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "rtl_return"}
  <Home {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "geofence"}
  <Fence {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "arming"}
  <Lock {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "initial_params"}
  <Calculator {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "pid_tuning"}
  <Activity {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "peripherals"}
  <Puzzle {size} class={iconClass} aria-hidden="true" />
{:else if sectionId === "full_parameters"}
  <SlidersVertical {size} class={iconClass} aria-hidden="true" />
{/if}
