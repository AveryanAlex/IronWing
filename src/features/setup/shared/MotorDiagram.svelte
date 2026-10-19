<script lang="ts">
import { MotorRotation, MotorLayer, type Airframe } from "../../../lib/airframe";
import { projectMotorPositions } from "../../../lib/setup/motor-diagram-projection";
import type { MotorDiagramModel } from "../../../lib/setup/vtol-layout-model";
import { getApMotorDiagramModel } from "../../../lib/setup/vtol-layout-model";

let {
  frame = null,
  model = null,
  activeMotor = null,
  size = 200,
}: {
  frame?: Airframe | null;
  model?: MotorDiagramModel | null;
  activeMotor?: number | null;
  size?: number;
} = $props();

const VIEWBOX = 300;
const CENTER = VIEWBOX / 2;
const MOTOR_RADIUS = 17;
const LABEL_FONT_SIZE = 16;

function rotationArcPath(cx: number, cy: number, r: number, cw: boolean): string {
  const arcR = r + 5;
  const startAngle = cw ? -140 : -40;
  const endAngle = cw ? -40 : -140;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const x1 = cx + arcR * Math.cos(toRad(startAngle));
  const y1 = cy + arcR * Math.sin(toRad(startAngle));
  const x2 = cx + arcR * Math.cos(toRad(endAngle));
  const y2 = cy + arcR * Math.sin(toRad(endAngle));

  const sweep = cw ? 1 : 0;
  return `M ${x1} ${y1} A ${arcR} ${arcR} 0 0 ${sweep} ${x2} ${y2}`;
}

function arrowheadPoints(cx: number, cy: number, r: number, cw: boolean): string {
  const arcR = r + 5;
  const endAngle = cw ? -40 : -140;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const tipX = cx + arcR * Math.cos(toRad(endAngle));
  const tipY = cy + arcR * Math.sin(toRad(endAngle));

  const tangentAngle = cw ? endAngle + 90 : endAngle - 90;
  const perpAngle = tangentAngle + 90;
  const toRadT = toRad(tangentAngle);
  const toRadP = toRad(perpAngle);

  const len = 5;
  const spread = 3;

  const baseX = tipX - len * Math.cos(toRadT);
  const baseY = tipY - len * Math.sin(toRadT);

  const p1x = baseX + spread * Math.cos(toRadP);
  const p1y = baseY + spread * Math.sin(toRadP);
  const p2x = baseX - spread * Math.cos(toRadP);
  const p2y = baseY - spread * Math.sin(toRadP);

  return `${tipX},${tipY} ${p1x},${p1y} ${p2x},${p2y}`;
}

let resolvedModel = $derived.by(() => {
  if (model) return model;
  return getApMotorDiagramModel(frame);
});

let motorPositions = $derived.by(() => {
  if (!resolvedModel || resolvedModel.status === "unsupported") return [];

  return projectMotorPositions(resolvedModel.motors, VIEWBOX, VIEWBOX);
});
</script>

{#if !resolvedModel}
  <div
    class="flex max-w-full items-center justify-center rounded-lg border border-border bg-bg-tertiary/50 px-3 text-center text-xs text-text-muted"
    style="width: {size}px; height: {size}px;"
  >
    No layout available
  </div>
{:else if resolvedModel.status !== "supported"}
  <div
    class="flex max-w-full items-center justify-center rounded-lg border border-warning/30 bg-warning/10 px-3 text-center text-xs leading-relaxed text-warning"
    style="width: {size}px; height: {size}px;"
  >
    {resolvedModel.message ?? "Unsupported VTOL layout"}
  </div>
{:else}
  <svg
    viewBox="0 0 {VIEWBOX} {VIEWBOX}"
    width={size}
    height={size}
    class="h-auto max-w-full select-none"
    aria-label={`${resolvedModel.className} ${resolvedModel.typeName} motor diagram`}
  >
    <text x={CENTER} y={12} text-anchor="middle" class="fill-text-muted" font-size={12}>FRONT · TOP VIEW</text>
    {#each motorPositions as { motor, cx, cy } (motor.motorNumber)}
      <line
        x1={CENTER}
        y1={CENTER}
        x2={cx}
        y2={cy}
        class="stroke-border-light"
        stroke-width={6}
        stroke-linecap="round"
      />
    {/each}

    <circle
      cx={CENTER}
      cy={CENTER}
      r={8}
      class="fill-bg-tertiary stroke-border"
      stroke-width={2}
    />

    {#each motorPositions as { motor, cx, cy } (motor.motorNumber)}
      <g>
        <title>Motor {motor.motorNumber}{motor.position.layer ? ` · ${motor.position.layer}` : ""} · {motor.rotation}</title>
        {#if activeMotor === motor.motorNumber}
          <circle
            cx={cx}
            cy={cy}
            r={MOTOR_RADIUS + 4}
            class="fill-none stroke-accent"
            stroke-width={2}
            opacity={0.6}
          >
            <animate
              attributeName="opacity"
              values="0.3;0.8;0.3"
              dur="1s"
              repeatCount="indefinite"
            />
          </circle>
        {/if}

        <circle
          cx={cx}
          cy={cy}
          r={MOTOR_RADIUS}
          class={activeMotor === motor.motorNumber
            ? "fill-accent/20 stroke-accent"
            : motor.role === "tilt"
              ? "fill-accent/10 stroke-accent"
              : "fill-bg-secondary stroke-accent"}
          stroke-width={2}
        />

        {#if motor.rotation !== MotorRotation.Unknown}
          {@const isCW = motor.rotation === MotorRotation.Clockwise}
          <path
            d={rotationArcPath(cx, cy, MOTOR_RADIUS, isCW)}
            class="fill-none stroke-accent"
            stroke-width={1.5}
            opacity={activeMotor === motor.motorNumber ? 1 : 0.6}
          />
          <polygon
            points={arrowheadPoints(cx, cy, MOTOR_RADIUS, isCW)}
            class="fill-accent"
            opacity={activeMotor === motor.motorNumber ? 1 : 0.6}
          />
        {:else}
          <text
            x={cx}
            y={cy - MOTOR_RADIUS - 6}
            text-anchor="middle"
            class="fill-text-muted"
            font-size={8}
          >
            ?
          </text>
        {/if}

        {#if motor.role === "tilt" && !motor.position.layer}
          <text
            x={cx}
            y={cy - MOTOR_RADIUS - 12}
            text-anchor="middle"
            class="fill-accent"
            font-size={7}
            font-weight={700}
          >
            tilt
          </text>
        {/if}

        <text
          x={cx}
          y={cy + (motor.position.layer ? -1 : LABEL_FONT_SIZE * 0.35)}
          text-anchor="middle"
          class={activeMotor === motor.motorNumber ? "fill-accent" : "fill-text-primary"}
          font-size={LABEL_FONT_SIZE}
          font-weight={600}
        >
          {motor.motorNumber}
        </text>
        {#if motor.position.layer}
          <text x={cx} y={cy + 11} text-anchor="middle" class="fill-text-muted" font-size={10}>{motor.position.layer}</text>
        {/if}
      </g>
    {/each}
    {#if resolvedModel.motors.some((motor) => motor.position.layer !== null)}
      <text x={CENTER} y={VIEWBOX - 7} text-anchor="middle" class="fill-text-muted" font-size={10}>Top / bottom motors shown separately</text>
    {/if}
  </svg>
{/if}
