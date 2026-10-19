<script lang="ts">
import { projectMotorPositions } from "../../../lib/setup/motor-diagram-projection";
import type { VtolPropulsor, VtolTopologySnapshot } from "../../../lib/setup/vtol-topology-model";
import {
  resolveSetupControlAvailability,
  type SetupControlAvailability,
} from "../../../lib/setup/control-availability";
import SetupControlGuard from "../shared/SetupControlGuard.svelte";

type Props = {
  topology: VtolTopologySnapshot;
  selectableMask?: "tilt" | "forward" | null;
  disabled?: boolean;
  availability?: SetupControlAvailability;
  onMotorToggle?: (motorNumber: number) => void;
};

let { topology, selectableMask = null, disabled = false, availability, onMotorToggle }: Props = $props();

let selectionAvailability = $derived(
  resolveSetupControlAvailability({
    availability,
    disabled,
    disabledDescription: "Motor selection is locked until the VTOL topology requirements are met.",
  }),
);
let selectionDisabled = $derived(selectionAvailability.state === "locked");

const WIDTH = 320;
const HEIGHT = 300;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

function selected(propulsor: VtolPropulsor): boolean {
  if (selectableMask === "tilt") return propulsor.tilts;
  if (selectableMask === "forward") return propulsor.forwardActive;
  return false;
}

function canSelect(propulsor: VtolPropulsor): boolean {
  return !selectionDisabled && selectableMask !== null && propulsor.motorNumber !== null && Boolean(onMotorToggle);
}

function toggle(propulsor: VtolPropulsor) {
  if (canSelect(propulsor) && propulsor.motorNumber !== null) {
    onMotorToggle?.(propulsor.motorNumber);
  }
}

function handleKeydown(event: KeyboardEvent, propulsor: VtolPropulsor) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggle(propulsor);
}

function ownerLabel(propulsor: VtolPropulsor): string {
  if (propulsor.outputOwners.length === 0) return "unassigned";
  return propulsor.outputOwners.map((owner) => `SERVO${owner.outputIndex}`).join(", ");
}

let diagramPropulsors = $derived(projectMotorPositions(topology.propulsors, WIDTH, HEIGHT));
</script>

{#snippet motorGlyph(propulsor: VtolPropulsor, point: { x: number; y: number })}
  {#if selected(propulsor)}
    <circle cx={point.x} cy={point.y} r={21} class="fill-accent/10 stroke-accent" stroke-width={2} stroke-dasharray="4 3" />
  {/if}
  <circle
    cx={point.x}
    cy={point.y}
    r={17}
    class={propulsor.tilts ? "fill-accent/15 stroke-accent" : "fill-bg-secondary stroke-border-light"}
    stroke-width={2}
  />
  <text x={point.x} y={point.y - (propulsor.position.layer ? 5 : 0)} text-anchor="middle" dominant-baseline="middle" class="fill-text-primary" font-size={11} font-weight={700}>
    {propulsor.motorNumber === null ? propulsor.label.replace(" motor", "") : `M${propulsor.motorNumber}`}
  </text>
  {#if propulsor.position.layer}
    <text x={point.x} y={point.y + 10} text-anchor="middle" class="fill-text-muted" font-size={10}>{propulsor.position.layer}</text>
  {/if}
  {#if propulsor.tilts && !propulsor.position.layer}
    <text x={point.x} y={point.y - 27} text-anchor="middle" class="fill-accent" font-size={8} font-weight={700}>TILTS</text>
  {:else if propulsor.forwardActive && !propulsor.position.layer}
    <text x={point.x} y={point.y - 27} text-anchor="middle" class="fill-success" font-size={8} font-weight={700}>FORWARD</text>
  {/if}
  {#if !propulsor.position.layer}
  <text x={point.x} y={point.y + 29} text-anchor="middle" class="fill-text-muted" font-size={8}>{ownerLabel(propulsor)}</text>
  {/if}
{/snippet}

{#if !topology.supportedDiagram}
  <div class="flex min-h-64 items-center justify-center rounded-lg border border-warning/30 bg-warning/5 p-6 text-center text-sm leading-6 text-text-secondary">
    {topology.architecture === "custom"
      ? "The motor geometry is supplied by a script. IronWing can inspect output ownership, but cannot safely invent a diagram for this matrix."
      : "A motor diagram is unavailable until the VTOL architecture and hover frame form a valid combination."}
  </div>
{:else}
  <div class="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
    <SetupControlGuard
      availability={selectableMask ? selectionAvailability : { state: "available" }}
      label="Motor selection diagram"
      testId="vtol-motor-diagram-lock"
    >
      <div class="flex min-h-64 items-center justify-center rounded-lg border border-border bg-bg-primary/70 p-3">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-auto w-full max-w-80 select-none" aria-label={`${topology.architectureLabel}, ${topology.frameClassLabel} ${topology.frameTypeLabel} diagram`}>
        <text x={CENTER_X} y={10} text-anchor="middle" class="fill-text-muted" font-size={9}>FRONT · TOP VIEW</text>

        {#each diagramPropulsors as entry (entry.motor.id)}
          <line x1={CENTER_X} y1={CENTER_Y} x2={entry.cx} y2={entry.cy} class="stroke-border-light" stroke-width={7} stroke-linecap="round" />
        {/each}

        <path d={`M ${CENTER_X} ${CENTER_Y - 30} L ${CENTER_X - 18} ${CENTER_Y + 18} L ${CENTER_X} ${CENTER_Y + 10} L ${CENTER_X + 18} ${CENTER_Y + 18} Z`} class="fill-bg-tertiary stroke-border" stroke-width={2} />

        {#each diagramPropulsors as { motor: propulsor, cx, cy } (propulsor.id)}
          {@const point = { x: cx, y: cy }}
          {#if canSelect(propulsor)}
            <g
              role="button"
              tabindex="0"
              aria-pressed={selected(propulsor)}
              aria-label={`${selected(propulsor) ? "Remove" : "Add"} ${propulsor.label} ${selectableMask === "tilt" ? "from tilt mask" : "from forward-flight mask"}`}
              class="cursor-pointer outline-none"
              onclick={() => toggle(propulsor)}
              onkeydown={(event) => handleKeydown(event, propulsor)}
            >
              {@render motorGlyph(propulsor, point)}
            </g>
          {:else}
            <g aria-label={propulsor.label}>{@render motorGlyph(propulsor, point)}</g>
          {/if}
        {/each}
        </svg>
      </div>
    </SetupControlGuard>

    <div class="space-y-3">
      <div>
        <p class="text-sm font-semibold text-text-primary">Logical motors</p>
        <p class="mt-1 text-xs leading-5 text-text-muted">Motor numbers belong to the ArduPilot mixer; SERVO numbers are physical flight-controller outputs.</p>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        {#each topology.propulsors as propulsor (propulsor.id)}
          <div class="rounded-md border border-border bg-bg-secondary/70 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm font-semibold text-text-primary">{propulsor.label}</span>
              <span class="font-mono text-xs text-text-muted">Fn {propulsor.functionValue}</span>
            </div>
            <p class="mt-1 text-xs text-text-muted">{ownerLabel(propulsor)}</p>
          </div>
        {/each}
      </div>

      {#if topology.actuators.length > 0}
        <div>
          <p class="text-sm font-semibold text-text-primary">Tilt and yaw actuators</p>
          <div class="mt-2 space-y-2">
            {#each topology.actuators as actuator (actuator.id)}
              <div class="rounded-md border border-accent/25 bg-accent/5 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-sm font-semibold text-text-primary">{actuator.label}</span>
                  <span class="font-mono text-xs text-accent">Fn {actuator.functionValue}</span>
                </div>
                <p class="mt-1 text-xs leading-5 text-text-muted">
                  Controls {actuator.controlsPropulsorIds.map((id) => topology.propulsors.find((motor) => motor.id === id)?.label ?? id).join(", ")}
                  · {actuator.outputOwners.length > 0 ? actuator.outputOwners.map((owner) => `SERVO${owner.outputIndex}`).join(", ") : "unassigned"}
                </p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
