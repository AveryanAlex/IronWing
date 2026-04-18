<script lang="ts">
  type Props = {
    value: number;
    step?: number;
    labelStep?: number;
    side: "left" | "right";
  };

  let { value, step = 10, labelStep = 50, side }: Props = $props();

  const PX_PER_UNIT = 2;
  const VISIBLE_RANGE = 75;
  const LABEL_TICK_WIDTH = 15;
  const MINOR_TICK_WIDTH = 8;

  let ticks = $derived.by(() => {
    const minVal = Math.floor((value - VISIBLE_RANGE) / step) * step;
    const maxVal = Math.ceil((value + VISIBLE_RANGE) / step) * step;
    const result: Array<{ tickValue: number; isLabel: boolean; y: number }> = [];
    for (let v = minVal; v <= maxVal; v += step) {
      result.push({
        tickValue: v,
        isLabel: v % labelStep === 0,
        y: -(v - value) * PX_PER_UNIT,
      });
    }
    return result;
  });

  let isLeft = $derived(side === "left");
</script>

<svg
  viewBox="0 -150 70 300"
  xmlns="http://www.w3.org/2000/svg"
  style="width: 100%; height: 100%;"
>
  <!-- Background -->
  <rect x="0" y="-150" width="70" height="300" fill="rgba(0, 0, 0, 0.5)" rx="4" />

  <!-- Ticks and labels -->
  {#each ticks as { tickValue, isLabel, y } (tickValue)}
    {#if isLeft}
      <line
        x1={isLabel ? 70 - LABEL_TICK_WIDTH : 70 - MINOR_TICK_WIDTH}
        y1={y}
        x2="70"
        y2={y}
        stroke="#57e38b"
        stroke-width={isLabel ? 1.5 : 0.75}
      />
      {#if isLabel}
        <text
          x="48"
          y={y}
          fill="#57e38b"
          font-size="10"
          font-family="'JetBrains Mono', monospace"
          text-anchor="end"
          dominant-baseline="central"
        >{tickValue}</text>
      {/if}
    {:else}
      <line
        x1="0"
        y1={y}
        x2={isLabel ? LABEL_TICK_WIDTH : MINOR_TICK_WIDTH}
        y2={y}
        stroke="#57e38b"
        stroke-width={isLabel ? 1.5 : 0.75}
      />
      {#if isLabel}
        <text
          x="22"
          y={y}
          fill="#57e38b"
          font-size="10"
          font-family="'JetBrains Mono', monospace"
          text-anchor="start"
          dominant-baseline="central"
        >{tickValue}</text>
      {/if}
    {/if}
  {/each}

  <!-- Current value box -->
  <rect x="8" y="-12" width="54" height="24" rx="3" fill="#0a0e14" stroke="#12b9ff" stroke-width="1.5" />
  <text
    x="35"
    y="0"
    fill="#12b9ff"
    font-size="12"
    font-weight="bold"
    font-family="'JetBrains Mono', monospace"
    text-anchor="middle"
    dominant-baseline="central"
  >{Math.round(value)}</text>
</svg>
