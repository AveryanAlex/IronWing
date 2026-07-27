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
  Monitor,
  Plane,
  PlaneTakeoff,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
  SlidersVertical,
} from "lucide-svelte";

import {
  getSetupSectionDefinition,
  type SetupSectionIconKey,
  type SetupSectionId,
} from "../../../lib/setup-sections";

type IconComponent = typeof LayoutDashboard;

const icons = {
  overview: LayoutDashboard,
  frame: Box,
  vtol: PlaneTakeoff,
  calibration: Compass,
  receiver: Radio,
  navigation: Navigation,
  battery: Battery,
  motors: Cog,
  servos: SlidersHorizontal,
  serial: Cable,
  osd: Monitor,
  flight_modes: Plane,
  failsafe: ShieldAlert,
  return: Home,
  geofence: Fence,
  arming: Lock,
  calculator: Calculator,
  tuning: Activity,
  parameters: SlidersVertical,
} satisfies Record<SetupSectionIconKey, IconComponent>;

type Props = {
  sectionId: SetupSectionId;
  size?: number;
};

let { sectionId, size = 14 }: Props = $props();
let Icon = $derived(icons[getSetupSectionDefinition(sectionId).iconKey]);
</script>

<Icon {size} class="shrink-0" aria-hidden="true" />
