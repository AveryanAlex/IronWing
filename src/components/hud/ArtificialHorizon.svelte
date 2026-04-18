<script lang="ts">
  type Props = {
    pitch: number;
    roll: number;
  };

  let { pitch, roll }: Props = $props();

  const PITCH_SCALE = 4;
  const CLIP_RADIUS = 190;
  const ROLL_ARC_RADIUS = 170;
  const MINOR_HALF_WIDTH = 20;
  const MAJOR_HALF_WIDTH = 40;
  const REFERENCE_BAR_WIDTH = 60;
  const REFERENCE_GAP = 10;
  const CENTER_SQUARE_SIZE = 5;

  const pitchLines = Array.from({ length: 37 }, (_, i) => {
    const deg = -90 + i * 5;
    return { deg, isMajor: deg % 10 === 0 };
  });

  const rollTicks = [-60, -50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50, 60];

  function rollTickLength(deg: number): number {
    const abs = Math.abs(deg);
    return abs === 0 || abs === 30 || abs === 60 ? 14 : 8;
  }

  let sceneTransform = $derived(
    `rotate(${-roll}) translate(0, ${pitch * PITCH_SCALE})`,
  );
</script>

<svg
  viewBox="-200 -200 400 400"
  xmlns="http://www.w3.org/2000/svg"
  style="width: 100%; height: 100%;"
>
  <defs>
    <linearGradient id="ah-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d47a1" />
      <stop offset="100%" stop-color="#1e88e5" />
    </linearGradient>
    <linearGradient id="ah-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5d4037" />
      <stop offset="100%" stop-color="#3e2723" />
    </linearGradient>
    <clipPath id="ah-clip">
      <circle cx="0" cy="0" r={CLIP_RADIUS} />
    </clipPath>
  </defs>

  <!-- Clipped rotating scene -->
  <g clip-path="url(#ah-clip)">
    <g transform={sceneTransform}>
      <!-- Sky -->
      <rect x="-600" y="-1200" width="1200" height="1200" fill="url(#ah-sky)" />
      <!-- Ground -->
      <rect x="-600" y="0" width="1200" height="1200" fill="url(#ah-ground)" />
      <!-- Horizon line -->
      <line x1="-600" y1="0" x2="600" y2="0" stroke="white" stroke-width="1.5" />

      <!-- Pitch ladder -->
      {#each pitchLines as { deg, isMajor } (deg)}
        {@const y = -deg * PITCH_SCALE}
        {#if deg !== 0}
          {#if isMajor}
            <line
              x1={-MAJOR_HALF_WIDTH}
              y1={y}
              x2={MAJOR_HALF_WIDTH}
              y2={y}
              stroke="white"
              stroke-width="1.5"
            />
            <text
              x={-MAJOR_HALF_WIDTH - 6}
              y={y}
              fill="white"
              font-size="10"
              font-family="'JetBrains Mono', monospace"
              text-anchor="end"
              dominant-baseline="central"
            >{Math.abs(deg)}</text>
            <text
              x={MAJOR_HALF_WIDTH + 6}
              y={y}
              fill="white"
              font-size="10"
              font-family="'JetBrains Mono', monospace"
              text-anchor="start"
              dominant-baseline="central"
            >{Math.abs(deg)}</text>
          {:else}
            <line
              x1={-MINOR_HALF_WIDTH}
              y1={y}
              x2={MINOR_HALF_WIDTH}
              y2={y}
              stroke="white"
              stroke-width="0.75"
            />
          {/if}
        {/if}
      {/each}
    </g>
  </g>

  <!-- Roll arc (fixed, outside the pitch transform) -->
  <g clip-path="url(#ah-clip)">
    <g transform={`rotate(${-roll})`}>
      {#each rollTicks as deg (deg)}
        {@const angle = (deg - 90) * (Math.PI / 180)}
        {@const len = rollTickLength(deg)}
        {@const x1 = Math.cos(angle) * ROLL_ARC_RADIUS}
        {@const y1 = Math.sin(angle) * ROLL_ARC_RADIUS}
        {@const x2 = Math.cos(angle) * (ROLL_ARC_RADIUS - len)}
        {@const y2 = Math.sin(angle) * (ROLL_ARC_RADIUS - len)}
        <line {x1} {y1} {x2} {y2} stroke="white" stroke-width="1.5" />
      {/each}
    </g>
  </g>

  <!-- Roll pointer (fixed at top, pointing down) -->
  <polygon
    points={`-8,-${CLIP_RADIUS - 2} 8,-${CLIP_RADIUS - 2} 0,-${CLIP_RADIUS - 14}`}
    fill="white"
  />

  <!-- Fixed reference bars (aircraft wings) -->
  <line
    x1={-REFERENCE_BAR_WIDTH - REFERENCE_GAP}
    y1="0"
    x2={-REFERENCE_GAP}
    y2="0"
    stroke="#12b9ff"
    stroke-width="3"
  />
  <line
    x1={REFERENCE_GAP}
    y1="0"
    x2={REFERENCE_BAR_WIDTH + REFERENCE_GAP}
    y2="0"
    stroke="#12b9ff"
    stroke-width="3"
  />
  <rect
    x={-CENTER_SQUARE_SIZE}
    y={-CENTER_SQUARE_SIZE}
    width={CENTER_SQUARE_SIZE * 2}
    height={CENTER_SQUARE_SIZE * 2}
    fill="none"
    stroke="#12b9ff"
    stroke-width="2"
  />
</svg>
