<script lang="ts">
type Props = {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  yawDeg?: number | null;
  stale?: boolean;
};

let { rollDeg = null, pitchDeg = null, yawDeg = null, stale = false }: Props = $props();

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatDeg(value: number | null | undefined): string {
  if (!finite(value)) return "--°";
  return `${value.toFixed(1)}°`;
}

let roll = $derived(finite(rollDeg) ? rollDeg : 0);
let pitch = $derived(finite(pitchDeg) ? pitchDeg : 0);
let yaw = $derived(finite(yawDeg) ? yawDeg : 0);
let visualRoll = $derived(clamp(roll, -75, 75));
let visualPitch = $derived(clamp(pitch, -45, 45));
let yawText = $derived(formatDeg(yawDeg));
let hasAnyAttitude = $derived(finite(rollDeg) || finite(pitchDeg) || finite(yawDeg));
</script>

<section
  class="overflow-hidden rounded-lg border border-border bg-bg-primary/80 p-3 data-[stale]:opacity-70"
  data-stale={stale || undefined}
>
  <div class="flex items-center justify-between gap-2">
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Orientation</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">Heading {yawText}</p>
    </div>
    <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
      {hasAnyAttitude ? stale ? "stale" : "live" : "waiting"}
    </span>
  </div>

  <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
    <div
      class="relative min-h-48 overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_50%_35%,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_42%),linear-gradient(180deg,var(--color-bg-secondary),var(--color-bg-primary))]"
      aria-hidden="true"
    >
      <div class="absolute inset-x-0 top-1/2 h-px bg-border/60"></div>
      <div class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border/40"></div>
      <div class="absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-full border border-border/50"></div>
      <div class="absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-border bg-bg-primary/70 px-2 py-1 font-mono text-xs font-semibold text-text-secondary">
        {Math.round(((yaw % 360) + 360) % 360)}°
      </div>

      <div class="absolute inset-0 flex items-center justify-center [perspective:520px]">
        <div
          class="relative h-28 w-36 transition-transform duration-150 ease-out [transform-style:preserve-3d]"
          style:transform={`rotateX(${-visualPitch}deg) rotateZ(${visualRoll}deg)`}
        >
          <div class="absolute left-1/2 top-1/2 h-8 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/25 blur-xl"></div>
          <svg class="absolute inset-0 h-full w-full drop-shadow-lg" viewBox="0 0 144 112" role="img" aria-label="Vehicle attitude model">
            <path d="M72 8 L84 54 L136 64 L138 76 L86 72 L78 104 L66 104 L58 72 L6 76 L8 64 L60 54 Z" fill="currentColor" class="text-accent" />
            <path d="M72 8 L78 54 L72 68 L66 54 Z" fill="white" fill-opacity="0.38" />
            <path d="M58 72 L86 72 L78 104 L66 104 Z" fill="black" fill-opacity="0.18" />
            <circle cx="72" cy="58" r="6" fill="white" fill-opacity="0.72" />
            <path d="M72 8 L67 24 L77 24 Z" fill="white" fill-opacity="0.78" />
          </svg>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 md:w-36 md:grid-cols-1">
      <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
        <p class="text-[0.65rem] font-semibold uppercase tracking-wide text-text-muted">Roll</p>
        <p class="mt-0.5 font-mono text-sm font-semibold text-text-primary">{formatDeg(rollDeg)}</p>
      </div>
      <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
        <p class="text-[0.65rem] font-semibold uppercase tracking-wide text-text-muted">Pitch</p>
        <p class="mt-0.5 font-mono text-sm font-semibold text-text-primary">{formatDeg(pitchDeg)}</p>
      </div>
      <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
        <p class="text-[0.65rem] font-semibold uppercase tracking-wide text-text-muted">Yaw</p>
        <p class="mt-0.5 font-mono text-sm font-semibold text-text-primary">{yawText}</p>
      </div>
    </div>
  </div>
</section>
