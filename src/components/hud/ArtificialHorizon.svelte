<script lang="ts">
  type Props = {
    pitch: number | undefined;
    roll: number | undefined;
    size: { width: number; height: number };
    climbRate?: number;
    groundSpeed?: number;
  };

  let { pitch, roll, size, climbRate, groundSpeed }: Props = $props();

  const ACCENT = "#12b9ff";
  const FPV_COLOR = "#57e38b";
  const PX_PER_DEG = 4;
  const PITCH_CLAMP = 40;

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
    y: number;
    halfWidth: number;
    isDashed: boolean;
    showLabel: boolean;
  }> = [];
  for (let deg = -PITCH_CLAMP; deg <= PITCH_CLAMP; deg += 5) {
    if (deg === 0) continue;
    pitchLines.push({
      deg,
      y: -deg * PX_PER_DEG,
      halfWidth: deg % 10 === 0 ? 60 : 30,
      isDashed: deg < 0,
      showLabel: deg % 10 === 0,
    });
  }

  let { width, height } = $derived(size);
  let cx = $derived(width / 2);
  let cy = $derived(height / 2);

  let hasPitch = $derived(pitch != null && !Number.isNaN(pitch));
  let hasRoll = $derived(roll != null && !Number.isNaN(roll));
  let pitchVal = $derived(hasPitch ? Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, pitch!)) : 0);
  let rollVal = $derived(hasRoll ? roll! : 0);

  // Background extent — oversized to handle rotation without gaps
  let bgExtent = $derived(Math.max(width, height) * 2);

  // Roll arc radius
  let rollRadius = $derived(Math.min(cx, cy) - 24);

  // Flight path vector angle
  let fpvAngle = $derived.by(() => {
    if (climbRate == null || groundSpeed == null || groundSpeed < 1) return null;
    const gamma = Math.atan2(climbRate, groundSpeed) * (180 / Math.PI);
    return Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, gamma));
  });

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
    <linearGradient id="sky-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(15, 45, 110, 0.2)" />
      <stop offset="100%" stop-color="rgba(30, 80, 180, 0.05)" />
    </linearGradient>
    <linearGradient id="ground-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(120, 60, 20, 0.25)" />
      <stop offset="100%" stop-color="rgba(80, 35, 10, 0.1)" />
    </linearGradient>
  </defs>

  <!-- Pitch ladder + horizon, rotated and translated -->
  <g clip-path="url(#horizon-clip)">
    <g transform={`translate(${cx}, ${cy}) rotate(${-rollVal})`}>
      <!-- Sky fill -->
      <rect
        x={-bgExtent}
        y={pitchVal * PX_PER_DEG - bgExtent * 2}
        width={bgExtent * 2}
        height={bgExtent * 2}
        fill="url(#sky-gradient)"
      />

      <!-- Ground fill -->
      <rect
        x={-bgExtent}
        y={pitchVal * PX_PER_DEG}
        width={bgExtent * 2}
        height={bgExtent * 2}
        fill="url(#ground-gradient)"
      />

      <!-- Horizon line -->
      <line
        x1={-width}
        y1={pitchVal * PX_PER_DEG}
        x2={width}
        y2={pitchVal * PX_PER_DEG}
        stroke={ACCENT}
        stroke-width="2.5"
        opacity="0.8"
      />

      <!-- Pitch ladder -->
      <g transform={`translate(0, ${pitchVal * PX_PER_DEG})`}>
        {#each pitchLines as line (line.deg)}
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
        {@const fpvY = (pitchVal - fpvAngle) * PX_PER_DEG}
        <g transform={`translate(0, ${fpvY})`} opacity="0.85">
          <circle cx="0" cy="0" r="5" fill="none" stroke={FPV_COLOR} stroke-width="1.5" />
          <line x1="-18" y1="0" x2="-7" y2="0" stroke={FPV_COLOR} stroke-width="1.5" />
          <line x1="7" y1="0" x2="18" y2="0" stroke={FPV_COLOR} stroke-width="1.5" />
          <line x1="0" y1="5" x2="0" y2="12" stroke={FPV_COLOR} stroke-width="1.5" />
        </g>
      {/if}
    </g>
  </g>

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

  <!-- Pitch and roll text readouts — dark outline for contrast over SVS -->
  <text
    x={cx - 50}
    y={height - 8}
    text-anchor="middle"
    font-size="12"
    font-weight="600"
    class="hud-svg-text"
    opacity="0.75"
    style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 3px;"
  >P {hasPitch ? pitch!.toFixed(1) : "--"}°</text>
  <text
    x={cx + 50}
    y={height - 8}
    text-anchor="middle"
    font-size="12"
    font-weight="600"
    class="hud-svg-text"
    opacity="0.75"
    style="paint-order: stroke; stroke: rgba(0,0,0,0.6); stroke-width: 3px;"
  >R {hasRoll ? roll!.toFixed(1) : "--"}°</text>
</svg>
