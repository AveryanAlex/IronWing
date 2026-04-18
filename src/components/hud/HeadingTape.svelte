<script lang="ts">
  type Props = {
    heading: number;
  };

  let { heading }: Props = $props();

  const PX_PER_DEG = 3;
  const VISIBLE_HALF_RANGE = 67;

  const CARDINALS: Record<number, string> = {
    0: "N",
    90: "E",
    180: "S",
    270: "W",
  };

  const INTERCARDINALS: Record<number, string> = {
    45: "NE",
    135: "SE",
    225: "SW",
    315: "NW",
  };

  function wrapDelta(deg: number, hdg: number): number {
    let d = deg - hdg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  function tickHeight(deg: number): number {
    if (deg in CARDINALS || deg in INTERCARDINALS) return 16;
    if (deg % 10 === 0) return 10;
    return 5;
  }

  let visibleTicks = $derived.by(() => {
    const result: Array<{
      deg: number;
      x: number;
      height: number;
      label: string | null;
      isCardinal: boolean;
    }> = [];

    for (let d = 0; d < 360; d += 5) {
      const delta = wrapDelta(d, heading);
      if (Math.abs(delta) > VISIBLE_HALF_RANGE) continue;

      const x = delta * PX_PER_DEG;
      const isCardinal = d in CARDINALS || d in INTERCARDINALS;
      let label: string | null = null;

      if (d in CARDINALS) {
        label = CARDINALS[d];
      } else if (d in INTERCARDINALS) {
        label = INTERCARDINALS[d];
      } else if (d % 10 === 0) {
        label = String(d);
      }

      result.push({ deg: d, x, height: tickHeight(d), label, isCardinal });
    }

    return result;
  });
</script>

<svg
  viewBox="-200 0 400 50"
  xmlns="http://www.w3.org/2000/svg"
  style="width: 100%; height: 100%;"
>
  <!-- Background -->
  <rect x="-200" y="0" width="400" height="50" fill="rgba(0, 0, 0, 0.5)" rx="4" />

  <!-- Ticks and labels -->
  {#each visibleTicks as { deg, x, height, label, isCardinal } (deg)}
    <line
      x1={x}
      y1="4"
      x2={x}
      y2={4 + height}
      stroke={isCardinal ? "#12b9ff" : "#57e38b"}
      stroke-width={isCardinal ? 1.5 : 0.75}
    />
    {#if label}
      <text
        x={x}
        y="30"
        fill={isCardinal ? "#12b9ff" : "#57e38b"}
        font-size={isCardinal ? "12" : "9"}
        font-weight={isCardinal ? "bold" : "normal"}
        font-family="'JetBrains Mono', monospace"
        text-anchor="middle"
        dominant-baseline="central"
      >{label}</text>
    {/if}
  {/each}

  <!-- Center pointer (triangle pointing up) -->
  <polygon points="-6,50 6,50 0,42" fill="#12b9ff" />

  <!-- Current heading box -->
  <rect x="-20" y="36" width="40" height="14" rx="2" fill="#0a0e14" stroke="#12b9ff" stroke-width="1" />
  <text
    x="0"
    y="43"
    fill="#12b9ff"
    font-size="9"
    font-weight="bold"
    font-family="'JetBrains Mono', monospace"
    text-anchor="middle"
    dominant-baseline="central"
  >{Math.round(heading)}°</text>
</svg>
