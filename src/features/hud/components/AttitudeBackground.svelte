<script lang="ts">
  type Props = {
    pitch: number | undefined;
    roll: number | undefined;
    size: { width: number; height: number };
    verticalFovDeg?: number;
  };

  let { pitch, roll, size, verticalFovDeg = 55 }: Props = $props();

  const ACCENT = "#12b9ff";
  const GRID_SPACING_PX = 40;
  const GROUND_GRID_ROW_COUNT = 18;
  const MAX_PROJECTED_ANGLE_DEG = 85;
  const MIN_VERTICAL_FOV_DEG = 10;
  const MAX_VERTICAL_FOV_DEG = 140;

  let { width, height } = $derived(size);
  let cx = $derived(width / 2);
  let cy = $derived(height / 2);
  let focalLengthPx = $derived((height / 2) / Math.tan(toRadians(resolveVerticalFovDeg(verticalFovDeg) / 2)));
  let pitchVal = $derived(isFiniteNumber(pitch) ? clamp(pitch, -MAX_PROJECTED_ANGLE_DEG, MAX_PROJECTED_ANGLE_DEG) : 0);
  let rollVal = $derived(isFiniteNumber(roll) ? roll : 0);
  let horizonY = $derived(projectAngleOffsetY(pitchVal, focalLengthPx));
  let bgExtent = $derived(Math.max(width, height) * 2 + Math.abs(horizonY));
  let backgroundGridLines = $derived.by(() => buildGridLines(bgExtent, GRID_SPACING_PX));
  let skyHorizontalGridLines = $derived.by(() => backgroundGridLines.filter((offset) => offset <= 0));
  let groundDepthLines = $derived.by(() => buildGridLines(bgExtent, GRID_SPACING_PX));
  let groundGridRows = $derived.by(() => buildPerspectiveRows(bgExtent, GROUND_GRID_ROW_COUNT));

  function resolveVerticalFovDeg(value: number): number {
    return clamp(isFiniteNumber(value) ? value : 55, MIN_VERTICAL_FOV_DEG, MAX_VERTICAL_FOV_DEG);
  }

  function projectAngleOffsetY(angleDeg: number, focalLengthPx: number): number {
    return Math.tan(toRadians(clamp(angleDeg, -MAX_PROJECTED_ANGLE_DEG, MAX_PROJECTED_ANGLE_DEG))) * focalLengthPx;
  }

  function isFiniteNumber(value: number | null | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
  }

  function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function buildGridLines(extentPx: number, spacingPx: number): number[] {
    const lineCount = Math.ceil(extentPx / spacingPx);
    return Array.from({ length: lineCount * 2 + 1 }, (_, index) => (index - lineCount) * spacingPx);
  }

  function buildPerspectiveRows(extentPx: number, rowCount: number): number[] {
    return Array.from({ length: rowCount }, (_, index) => {
      const depth = (index + 1) / rowCount;
      return Math.pow(depth, 1.85) * extentPx;
    });
  }
</script>

<svg {width} {height} class="hud-glow-soft" style="overflow: hidden;">
  <defs>
    <clipPath id="attitude-background-clip">
      <rect x={0} y={0} {width} {height} />
    </clipPath>
    <linearGradient id="attitude-sky-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(15, 45, 110, 0.2)" />
      <stop offset="100%" stop-color="rgba(30, 80, 180, 0.05)" />
    </linearGradient>
    <linearGradient id="attitude-ground-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(120, 60, 20, 0.25)" />
      <stop offset="100%" stop-color="rgba(80, 35, 10, 0.1)" />
    </linearGradient>
  </defs>

  <g clip-path="url(#attitude-background-clip)">
    <g transform={`translate(${cx}, ${cy}) rotate(${-rollVal})`} data-testid="attitude-background-projection">
      <rect
        x={-bgExtent}
        y={horizonY - bgExtent * 2}
        width={bgExtent * 2}
        height={bgExtent * 2}
        fill="url(#attitude-sky-gradient)"
        data-testid="attitude-background-sky"
      />
      <rect
        x={-bgExtent}
        y={horizonY}
        width={bgExtent * 2}
        height={bgExtent * 2}
        fill="url(#attitude-ground-gradient)"
        data-testid="attitude-background-ground"
      />
      <g transform={`translate(0, ${horizonY})`} data-testid="attitude-background-sky-grid">
        {#each backgroundGridLines as offset (offset)}
          <line x1={offset} y1={-bgExtent} x2={offset} y2={0} stroke={ACCENT} stroke-width="1" opacity="0.07" />
        {/each}
        {#each skyHorizontalGridLines as offset (offset)}
          <line x1={-bgExtent} y1={offset} x2={bgExtent} y2={offset} stroke={ACCENT} stroke-width="1" opacity="0.07" />
        {/each}
      </g>
      <g transform={`translate(0, ${horizonY})`} data-testid="attitude-background-ground-grid">
        {#each groundDepthLines as offset (offset)}
          <line x1={offset} y1="0" x2={offset} y2={bgExtent} stroke={ACCENT} stroke-width="1" opacity="0.10" />
        {/each}
        {#each groundGridRows as rowY (rowY)}
          <line x1={-bgExtent} y1={rowY} x2={bgExtent} y2={rowY} stroke={ACCENT} stroke-width="1" opacity="0.10" />
        {/each}
      </g>
      <line
        x1={-width}
        y1={horizonY}
        x2={width}
        y2={horizonY}
        stroke={ACCENT}
        stroke-width="2.5"
        opacity="0.8"
        data-testid="attitude-background-horizon-line"
      />
    </g>
  </g>
</svg>
