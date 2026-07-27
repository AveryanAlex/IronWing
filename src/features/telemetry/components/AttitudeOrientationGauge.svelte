<script lang="ts">
import { Badge, Card, Eyebrow, FactTile, HelperText, MonoValue } from "../../../components/ui";
import AttitudeOrientationScene from "./AttitudeOrientationScene.svelte";

type Props = {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  yawDeg?: number | null;
  vehicleType?: string | null;
  stale?: boolean;
};

let {
  rollDeg = null,
  pitchDeg = null,
  yawDeg = null,
  vehicleType = null,
  stale = false,
}: Props = $props();

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatDeg(value: number | null | undefined): string {
  if (!finite(value)) return "--°";
  return `${value.toFixed(1)}°`;
}

let yawText = $derived(formatDeg(yawDeg));
let hasAnyAttitude = $derived(finite(rollDeg) || finite(pitchDeg) || finite(yawDeg));
</script>

<Card.Root
  as="section"
  aria-label="Vehicle attitude orientation"
  class="overflow-hidden data-[stale]:opacity-70"
  density="compact"
  gap="none"
  surface="primary"
  data-stale={stale || undefined}
>
  <div class="flex items-center justify-between gap-2">
    <div>
      <Eyebrow tracking="widest">Orientation</Eyebrow>
      <HelperText class="mt-1 font-semibold" tone="primary">
        Heading <MonoValue value={yawText} />
      </HelperText>
    </div>
    <Badge variant="muted" size="sm">
      {hasAnyAttitude ? stale ? "stale" : "live" : "waiting"}
    </Badge>
  </div>

  <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
    <AttitudeOrientationScene {pitchDeg} {rollDeg} {vehicleType} {yawDeg} />

    <div class="grid grid-cols-3 gap-2 md:w-36 md:grid-cols-1">
      <FactTile label="Roll" value={formatDeg(rollDeg)} />
      <FactTile label="Pitch" value={formatDeg(pitchDeg)} />
      <FactTile label="Yaw" value={yawText} />
    </div>
  </div>
</Card.Root>
