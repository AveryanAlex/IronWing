<script lang="ts">
  type Props = {
    value: number | undefined;
    orientation: "vertical" | "horizontal";
    visibleRange: number;
    majorTickInterval: number;
    minorTicksPerMajor: number;
    size: { width: number; height: number };
    unit?: string;
    label?: string;
    bugValue?: number;
    trendValue?: number;
    circular?: boolean;
    circularRange?: number;
    growsUp?: boolean;
    terrainValue?: number;
  };

  let {
    value,
    orientation,
    visibleRange,
    majorTickInterval,
    minorTicksPerMajor,
    size,
    unit,
    label,
    bugValue,
    trendValue,
    circular = false,
    circularRange = 360,
    growsUp = true,
    terrainValue,
  }: Props = $props();

  const ACCENT = "#12b9ff";
  const BG = "#0a0f14";

  const HEADING_LABELS: Record<number, string> = {
    0: "N", 90: "E", 180: "S", 270: "W",
  };

  let isVertical = $derived(orientation === "vertical");
  let { width, height } = $derived(size);
  let displayValue = $derived(value ?? 0);
  let hasValue = $derived(value != null && !Number.isNaN(value));

  // Quantize to nearest integer for tick stability
  let quantized = $derived(Math.round(displayValue));

  let ticks = $derived.by(() => {
    const result: Array<{
      pos: number;
      isMajor: boolean;
      labelText: string | null;
      isCardinal: boolean;
    }> = [];

    const minorInterval = majorTickInterval / minorTicksPerMajor;
    const halfRange = visibleRange / 2;
    const start = quantized - halfRange - majorTickInterval;
    const end = quantized + halfRange + majorTickInterval;
    const firstTick = Math.floor(start / minorInterval) * minorInterval;
    const span = isVertical ? height : width;

    for (let val = firstTick; val <= end; val += minorInterval) {
      let displayVal = val;
      if (circular) {
        displayVal = ((val % circularRange) + circularRange) % circularRange;
      }

      const offset = val - quantized;
      const pxPerUnit = span / visibleRange;
      const pos = span / 2 + (growsUp && isVertical ? -1 : 1) * offset * pxPerUnit;

      if (pos < -20 || pos > span + 20) continue;

      const isMajor = Math.abs(val - Math.round(val / majorTickInterval) * majorTickInterval) < minorInterval * 0.1;

      let labelText: string | null = null;
      let isCardinal = false;
      if (isMajor) {
        const rounded = Math.round(displayVal);
        if (circular && HEADING_LABELS[rounded] !== undefined) {
          labelText = HEADING_LABELS[rounded];
          isCardinal = true;
        } else {
          labelText = String(rounded);
        }
      }

      result.push({ pos, isMajor, labelText, isCardinal });
    }

    return result;
  });

  // Sub-pixel fractional offset for smooth scrolling
  let span = $derived(isVertical ? height : width);
  let pxPerUnit = $derived(span / visibleRange);
  let fracPx = $derived((growsUp && isVertical ? 1 : -1) * (displayValue - quantized) * pxPerUnit);

  // Bug position
  let bugPos = $derived.by(() => {
    if (bugValue == null || !hasValue) return null;
    let offset = bugValue - displayValue;
    if (circular) {
      offset = ((offset % circularRange) + circularRange + circularRange / 2) % circularRange - circularRange / 2;
    }
    const pos = span / 2 + (growsUp && isVertical ? -1 : 1) * offset * pxPerUnit;
    if (pos < 0 || pos > span) return null;
    return pos;
  });

  // Terrain band position (vertical tapes only)
  let terrainPos = $derived.by(() => {
    if (terrainValue == null || !hasValue || !isVertical) return null;
    const offset = terrainValue - displayValue;
    return span / 2 + (growsUp ? -1 : 1) * offset * pxPerUnit;
  });

  // Trend arrow length
  let trendLen = $derived.by(() => {
    if (trendValue == null || !hasValue) return null;
    const maxLen = span * 0.3;
    const len = Math.max(-maxLen, Math.min(maxLen, trendValue * pxPerUnit * 6));
    if (Math.abs(len) < 3) return null;
    return len;
  });

  // Readout box dimensions
  let readoutW = $derived(isVertical ? width * 0.75 : 56);
  let readoutH = $derived(isVertical ? 28 : 24);
  let cx = $derived(width / 2);
  let cy = $derived(height / 2);

  function formatValue(v: number): string {
    if (circular) return String(Math.round(((v % circularRange) + circularRange) % circularRange));
    return Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(Math.abs(v) < 10 ? 1 : 0);
  }
</script>

<div
  class={isVertical ? "tape-mask-vertical" : "tape-mask-horizontal"}
  style:width="{width}px"
  style:height="{height}px"
>
  <svg
    {width}
    {height}
    class="hud-glow-soft"
    style="overflow: hidden;"
  >
    <!-- Label at top -->
    {#if label}
      <text
        x={cx}
        y="10"
        text-anchor="middle"
        font-size="10"
        font-weight="700"
        class="hud-svg-text"
        opacity="0.7"
        style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
      >{label}</text>
    {/if}

    <!-- Tick group with fractional scroll -->
    <g transform={isVertical ? `translate(0, ${fracPx})` : `translate(${fracPx}, 0)`}>
      {#each ticks as tick, i (i)}
        {#if isVertical}
          {@const tickLen = tick.isMajor ? 14 : 7}
          {@const x1 = width - tickLen}
          <line
            {x1} y1={tick.pos} x2={width} y2={tick.pos}
            class="hud-svg-line"
            stroke-width={tick.isMajor ? 2.5 : 1}
            opacity={tick.isMajor ? 0.9 : 0.4}
          />
          {#if tick.labelText}
            <text
              x={x1 - 6}
              y={tick.pos}
              text-anchor="end"
              dominant-baseline="central"
              font-size="12"
              font-weight={tick.isCardinal ? 700 : 600}
              class="hud-svg-text"
              opacity={tick.isCardinal ? 1 : 0.85}
              style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
            >{tick.labelText}</text>
          {/if}
        {:else}
          {@const tickLen = tick.isMajor ? 14 : 7}
          <line
            x1={tick.pos} y1="0" x2={tick.pos} y2={tickLen}
            class="hud-svg-line"
            stroke-width={tick.isMajor ? 2.5 : 1}
            opacity={tick.isMajor ? 0.9 : 0.4}
          />
          {#if tick.labelText}
            <text
              x={tick.pos}
              y={tickLen + 14}
              text-anchor="middle"
              font-size={tick.isCardinal ? 14 : 12}
              font-weight={tick.isCardinal ? 700 : 600}
              class="hud-svg-text"
              opacity={tick.isCardinal ? 1 : 0.85}
              style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
            >{tick.labelText}</text>
          {/if}
        {/if}
      {/each}
    </g>

    <!-- Terrain band — green shaded region below terrain level -->
    {#if terrainPos !== null}
      <rect
        x="0"
        y={terrainPos}
        {width}
        height={Math.max(0, span - terrainPos + span)}
        fill="rgba(34, 139, 34, 0.12)"
      />
      <line
        x1="0"
        y1={terrainPos}
        x2={width}
        y2={terrainPos}
        stroke="#57e38b"
        stroke-width="1.5"
        opacity="0.6"
        stroke-dasharray="4 3"
      />
    {/if}

    <!-- Bug indicator — vertical tape -->
    {#if bugPos !== null && isVertical}
      <polygon
        points={`${width},${bugPos - 4} ${width - 6},${bugPos} ${width},${bugPos + 4}`}
        fill="#57e38b"
        opacity="0.8"
      />
    {/if}

    <!-- Bug indicator — horizontal tape -->
    {#if bugPos !== null && !isVertical}
      <polygon
        points={`${bugPos},0 ${bugPos - 4},6 ${bugPos + 4},6`}
        fill="#57e38b"
        opacity="0.8"
      />
    {/if}

    <!-- Trend arrow -->
    {#if trendLen !== null && isVertical}
      <line
        x1={cx + readoutW / 2 + 4}
        y1={cy}
        x2={cx + readoutW / 2 + 4}
        y2={cy - trendLen}
        stroke={trendLen > 0 ? "#57e38b" : "#ff4444"}
        stroke-width="2.5"
        opacity="0.8"
      />
    {/if}

    <!-- Center readout box -->
    {#if isVertical}
      <!-- Pointer triangle -->
      <polygon
        points={`${width},${cy} ${width - 10},${cy - 6} ${width - 10},${cy + 6}`}
        fill={ACCENT}
      />
      <rect
        x={cx - readoutW / 2}
        y={cy - readoutH / 2}
        width={readoutW}
        height={readoutH}
        rx="1"
        fill={BG}
        stroke={ACCENT}
        stroke-width="2"
      />
    {:else}
      <!-- Down pointer triangle -->
      <polygon
        points={`${cx},0 ${cx - 6},10 ${cx + 6},10`}
        fill={ACCENT}
      />
      <rect
        x={cx - readoutW / 2}
        y={cy - readoutH / 2 + 4}
        width={readoutW}
        height={readoutH}
        rx="1"
        fill={BG}
        stroke={ACCENT}
        stroke-width="2"
      />
    {/if}

    <!-- Value text -->
    <text
      x={cx}
      y={isVertical ? cy : cy + 4}
      text-anchor="middle"
      dominant-baseline="central"
      font-size="16"
      font-weight="800"
      class="hud-svg-text"
    >{hasValue ? formatValue(displayValue) : "--"}</text>

    <!-- Unit label -->
    {#if unit && isVertical}
      <text
        x={cx}
        y={cy + readoutH / 2 + 12}
        text-anchor="middle"
        font-size="9"
        font-weight="600"
        class="hud-svg-text"
        opacity="0.6"
        style="paint-order: stroke; stroke: rgba(0,0,0,0.5); stroke-width: 2px;"
      >{unit}</text>
    {/if}
  </svg>
</div>
