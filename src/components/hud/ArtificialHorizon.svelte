<script lang="ts">
  type HorizonProjectionViewport = {
    width: number;
    height: number;
    offsetLeft: number;
    offsetTop: number;
  };

  type Props = {
    pitch: number | undefined;
    roll: number | undefined;
    visualPitch?: number;
    visualRoll?: number;
    size: { width: number; height: number };
    climbRate?: number;
    groundSpeed?: number;
    verticalFovDeg?: number;
    projectionViewport?: HorizonProjectionViewport | null;
    showPitchLadder?: boolean;
    showFrameInstruments?: boolean;
    showReadouts?: boolean;
  };

  let {
    pitch,
    roll,
    visualPitch,
    visualRoll,
    size,
    climbRate,
    groundSpeed,
    verticalFovDeg = 55,
    projectionViewport = null,
    showPitchLadder = true,
    showFrameInstruments = true,
    showReadouts = true,
  }: Props = $props();

  const ACCENT = "#12b9ff";
  const FPV_COLOR = "#57e38b";
  const PITCH_LADDER_LIMIT_DEG = 40;
  const MAX_PROJECTED_ANGLE_DEG = 85;
  const MIN_VERTICAL_FOV_DEG = 10;
  const MAX_VERTICAL_FOV_DEG = 140;

  const ROLL_TICKS: Array<{ deg: number; len: number }> = [
    { deg: -60, len: 12 },
    { deg: -45, len: 8 },
    { deg: -30, len: 12 },
    { deg: -20, len: 8 },
    { deg: -10, len: 8 },
    { deg: 0, len: 14 },
    { deg: 10, len: 8 },
    { deg: 20, len: 8 },
    { deg: 30, len: 12 },
    { deg: 45, len: 8 },
    { deg: 60, len: 12 },
  ];

  const pitchLines: Array<{
    deg: number;
    halfWidth: number;
    isDashed: boolean;
    showLabel: boolean;
  }> = [];
  for (let deg = -PITCH_LADDER_LIMIT_DEG; deg <= PITCH_LADDER_LIMIT_DEG; deg += 5) {
    if (deg === 0) continue;
    pitchLines.push({
      deg,
      halfWidth: deg % 10 === 0 ? 60 : 30,
      isDashed: deg < 0,
      showLabel: deg % 10 === 0,
    });
  }

  let { width, height } = $derived(size);
  let projection = $derived.by(() => resolveProjectionViewport(projectionViewport, width, height));
  let cx = $derived(projection.width / 2 - projection.offsetLeft);
  let cy = $derived(projection.height / 2 - projection.offsetTop);
  let labelCx = $derived(width / 2);
  let projectionFocalLengthPx = $derived(
    (projection.height / 2) / Math.tan(toRadians(resolveVerticalFovDeg(verticalFovDeg) / 2)),
  );

  let hasPitch = $derived(pitch != null && !Number.isNaN(pitch));
  let hasRoll = $derived(roll != null && !Number.isNaN(roll));
  let projectedPitch = $derived(visualPitch ?? pitch);
  let projectedRoll = $derived(visualRoll ?? roll);
  let hasProjectedPitch = $derived(projectedPitch != null && !Number.isNaN(projectedPitch));
  let hasProjectedRoll = $derived(projectedRoll != null && !Number.isNaN(projectedRoll));
  let pitchVal = $derived(
    hasProjectedPitch ? clamp(projectedPitch!, -MAX_PROJECTED_ANGLE_DEG, MAX_PROJECTED_ANGLE_DEG) : 0,
  );
  let rollVal = $derived(hasProjectedRoll ? projectedRoll! : 0);
  let projectedPitchLines = $derived.by(() =>
    pitchLines.map((line) => ({
      ...line,
      y: projectAngleOffsetY(pitchVal - line.deg, projectionFocalLengthPx),
    })),
  );

  // Roll arc radius
  let rollRadius = $derived(Math.max(24, Math.min(cx, width - cx, cy, height - cy) - 24));

  // Flight path vector angle
  let fpvAngle = $derived.by(() => {
    if (climbRate == null || groundSpeed == null || groundSpeed < 1) return null;
    const gamma = Math.atan2(climbRate, groundSpeed) * (180 / Math.PI);
    return clamp(gamma, -MAX_PROJECTED_ANGLE_DEG, MAX_PROJECTED_ANGLE_DEG);
  });

  function resolveProjectionViewport(
    viewport: HorizonProjectionViewport | null,
    fallbackWidth: number,
    fallbackHeight: number,
  ): HorizonProjectionViewport {
    return {
      width: finitePositive(viewport?.width) ?? Math.max(1, fallbackWidth),
      height: finitePositive(viewport?.height) ?? Math.max(1, fallbackHeight),
      offsetLeft: finiteNumber(viewport?.offsetLeft) ?? 0,
      offsetTop: finiteNumber(viewport?.offsetTop) ?? 0,
    };
  }

  function resolveVerticalFovDeg(value: number): number {
    return clamp(finiteNumber(value) ?? 55, MIN_VERTICAL_FOV_DEG, MAX_VERTICAL_FOV_DEG);
  }

  function projectAngleOffsetY(angleDeg: number, focalLengthPx: number): number {
    return Math.tan(toRadians(clamp(angleDeg, -MAX_PROJECTED_ANGLE_DEG, MAX_PROJECTED_ANGLE_DEG))) * focalLengthPx;
  }

  function finitePositive(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  }

  function finiteNumber(value: number | null | undefined): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }
</script>

<svg
  {width}
  {height}
  class="hud-glow-soft"
  style="overflow: hidden;"
>
  <defs>
    <clipPath id="horizon-clip">
      <rect x={0} y={0} {width} {height} />
    </clipPath>
  </defs>

  <!-- Pitch ladder, rotated and translated with the projected attitude. -->
  <g clip-path="url(#horizon-clip)">
    <g transform={`translate(${cx}, ${cy}) rotate(${-rollVal})`} data-testid="hud-horizon-projection">
      <!-- Pitch ladder -->
      {#if showPitchLadder}
        <g>
          {#each projectedPitchLines as line (line.deg)}
            <line
              x1={-line.halfWidth}
              y1={line.y}
              x2={line.halfWidth}
              y2={line.y}
              stroke={ACCENT}
              stroke-width={line.showLabel ? 2.5 : 1.5}
              stroke-dasharray={line.isDashed ? "8 6" : undefined}
              opacity={line.showLabel ? 0.8 : 0.5}
            />
            {#if line.showLabel}
              <text
                x={-line.halfWidth - 8}
                y={line.y}
                text-anchor="end"
                dominant-baseline="central"
                font-size="12"
                font-weight="700"
                class="hud-svg-text"
                opacity="0.85"
                style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
              >{line.deg}</text>
              <text
                x={line.halfWidth + 8}
                y={line.y}
                text-anchor="start"
                dominant-baseline="central"
                font-size="12"
                font-weight="700"
                class="hud-svg-text"
                opacity="0.85"
                style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
              >{line.deg}</text>
            {/if}
          {/each}
        </g>

        <!-- Flight path vector -->
        {#if fpvAngle !== null}
          {@const fpvY = projectAngleOffsetY(pitchVal - fpvAngle, projectionFocalLengthPx)}
          <g transform={`translate(0, ${fpvY})`} opacity="0.85">
            <circle cx="0" cy="0" r="5" fill="none" stroke={FPV_COLOR} stroke-width="1.5" />
            <line x1="-18" y1="0" x2="-7" y2="0" stroke={FPV_COLOR} stroke-width="1.5" />
            <line x1="7" y1="0" x2="18" y2="0" stroke={FPV_COLOR} stroke-width="1.5" />
            <line x1="0" y1="5" x2="0" y2="12" stroke={FPV_COLOR} stroke-width="1.5" />
          </g>
        {/if}
      {/if}
    </g>
  </g>

  {#if showFrameInstruments}
    <!-- Roll arc (fixed to frame) -->
    <g transform={`translate(${cx}, ${cy})`}>
      <!-- Arc path -->
      <path
        d={describeArc(0, 0, rollRadius, -60, 60)}
        fill="none"
        stroke={ACCENT}
        stroke-width="2"
        opacity="0.6"
      />

      <!-- Roll ticks -->
      {#each ROLL_TICKS as tick (tick.deg)}
        {@const rad = ((tick.deg - 90) * Math.PI) / 180}
        {@const x1 = Math.cos(rad) * rollRadius}
        {@const y1 = Math.sin(rad) * rollRadius}
        {@const x2 = Math.cos(rad) * (rollRadius - tick.len)}
        {@const y2 = Math.sin(rad) * (rollRadius - tick.len)}
        <line
          {x1} {y1} {x2} {y2}
          stroke={ACCENT}
          stroke-width={tick.deg === 0 ? 2.5 : 1.5}
          opacity={tick.deg === 0 ? 0.9 : 0.7}
        />
      {/each}

      <!-- Roll pointer (moves with roll) -->
      <g transform={`rotate(${-rollVal})`}>
        <polygon
          points={`0,${-rollRadius + 2} -6,${-rollRadius + 12} 6,${-rollRadius + 12}`}
          fill={ACCENT}
        />
      </g>

      <!-- Fixed zenith marker (above arc) -->
      <polygon
        points={`0,${-rollRadius - 2} -6,${-rollRadius - 12} 6,${-rollRadius - 12}`}
        fill="none"
        stroke={ACCENT}
        stroke-width="1.5"
        opacity="0.8"
      />
    </g>

    <!-- Aircraft reference symbol (fixed W-shape at center) -->
    <g transform={`translate(${cx}, ${cy})`} stroke={ACCENT} stroke-width="2.5" fill="none">
      <!-- Left wing -->
      <line x1="-40" y1="0" x2="-12" y2="0" />
      <line x1="-12" y1="0" x2="-12" y2="6" />
      <!-- Right wing -->
      <line x1="12" y1="0" x2="40" y2="0" />
      <line x1="12" y1="0" x2="12" y2="6" />
      <!-- Center dot -->
      <circle cx="0" cy="0" r="3" fill={ACCENT} />
    </g>
  {/if}

  <!-- Pitch and roll text readouts — dark outline for contrast over SVS -->
  {#if showReadouts}
    <text
      x={labelCx - 50}
      y={height - 8}
      text-anchor="middle"
      font-size="12"
      font-weight="600"
      class="hud-svg-text"
      opacity="0.75"
      style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 3px;"
    >P {hasPitch ? pitch!.toFixed(1) : "--"}°</text>
    <text
      x={labelCx + 50}
      y={height - 8}
      text-anchor="middle"
      font-size="12"
      font-weight="600"
      class="hud-svg-text"
      opacity="0.75"
      style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 3px;"
    >R {hasRoll ? roll!.toFixed(1) : "--"}°</text>
  {/if}
</svg>
