import { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    Gauge,
    Info,
    Loader2,
    Plane,
    SlidersHorizontal,
} from "lucide-react";
import { Button } from "../../ui/button";
import { setServo } from "../../../calibration";
import { PwmChannelBars } from "../shared/PwmChannelBars";
import { ParamSelect } from "../primitives/ParamSelect";
import { ParamNumberInput } from "../primitives/ParamNumberInput";
import { ParamToggle } from "../primitives/ParamToggle";
import {
    getParamMeta,
    getStagedOrCurrent,
    type ParamInputParams,
} from "../primitives/param-helpers";
import type { VehicleState, Telemetry } from "../../../telemetry";
import { deriveVtolProfile } from "../shared/vehicle-helpers";
import { SetupSectionIntro } from "../shared/SetupSectionIntro";
import { SectionCardHeader } from "../shared/SectionCardHeader";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import {
    clampServoCommandPwm,
    deriveServoTestTargets,
    isMotorServoFunction,
    readServoOutputPwm,
    type ServoTestTarget,
} from "./servo-test-helpers";

const MAX_SERVO_INDEX = 32;

function clampTargetPwm(target: ServoTestTarget, value: number): number {
    const clamped = clampServoCommandPwm(value);
    return Math.max(target.minPwm, Math.min(target.maxPwm, clamped));
}

function formatPwm(value: number): string {
    return `${Math.round(value)} µs`;
}

function detectServoIndices(params: ParamInputParams): number[] {
    const indices: number[] = [];
    for (let i = 1; i <= MAX_SERVO_INDEX; i++) {
        const key = `SERVO${i}_FUNCTION`;
        if (params.store?.params[key] !== undefined) {
            indices.push(i);
        }
    }
    return indices;
}

function hasAnyMotorAssignment(indices: number[], params: ParamInputParams): boolean {
    for (const i of indices) {
        const paramName = `SERVO${i}_FUNCTION`;
        const currentValue = params.store?.params[paramName]?.value ?? null;
        const stagedValue = params.staged.get(paramName);
        if (isMotorServoFunction(stagedValue ?? currentValue)) return true;
    }
    return false;
}

function asErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }

    if (typeof error === "string" && error.trim()) {
        return error;
    }

    return "Unknown actuation error";
}

function MotorAssignmentBanner() {
    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-warning/20 bg-warning/5 p-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-primary">
                    Motor assignments are automatic
                </span>
                <span className="text-[11px] text-text-secondary">
                    Motor function outputs (Motor 1–8) are set automatically based on your
                    frame type. Changing motor-assigned servo functions is for advanced
                    users only.
                </span>
            </div>
        </div>
    );
}

function PlaneGuidanceBanner() {
    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-3">
            <Plane size={14} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-primary">
                    Fixed-wing servo setup
                </span>
                <span className="text-[11px] text-text-secondary">
                    For planes, assign control surfaces to servo outputs: Aileron (4),
                    Elevator (19), Rudder (21), and Throttle (70). Verify min/max/trim
                    values match your servo travel, and use Reversed to correct control
                    direction.
                </span>
            </div>
        </div>
    );
}

function VtolServoGuidanceBanner({
    subtype,
}: {
    subtype: ReturnType<typeof deriveVtolProfile>["subtype"];
}) {
    const title = subtype === "tiltrotor"
        ? "Tilt-rotor servo guidance"
        : subtype === "tailsitter"
            ? "Tailsitter servo guidance"
            : "QuadPlane servo guidance";
    const body = subtype === "tiltrotor"
        ? "Tilt-rotor airframes mix auto-assigned lift motors with tilt or transition servos. Keep lift motors on motor functions, and use this section for tilt-mechanism travel, trim, and reversal."
        : subtype === "tailsitter"
            ? "Tailsitter airframes mix lift motors with elevon- or surface-driven transition outputs. Review the grouped tailsitter outputs below before live-testing any non-motor surface."
            : "QuadPlane airframes mix auto-assigned lift motors with non-motor control surfaces. Motor outputs stay automatic while servo-driven VTOL surfaces remain configurable here.";

    return (
        <div className="flex items-start gap-2.5 rounded-lg border border-accent/20 bg-accent/5 p-3">
            <Plane size={14} className="mt-0.5 shrink-0 text-accent" />
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-text-primary">
                    {title}
                </span>
                <span className="text-[11px] text-text-secondary">
                    {body}
                </span>
            </div>
        </div>
    );
}

type ServoOutputGroup = {
    id: string;
    title: string;
    description: string;
    indices: number[];
};

function resolveServoFunctionLabel(index: number, params: ParamInputParams): string {
    const paramName = `SERVO${index}_FUNCTION`;
    const functionValue = getStagedOrCurrent(paramName, params);
    if (functionValue == null) {
        return "";
    }

    const meta = getParamMeta(paramName, params.metadata);
    return meta?.values?.find((entry) => entry.code === functionValue)?.label ?? `Function ${functionValue}`;
}

function matchesVtolServoKeyword(
    label: string,
    subtype: ReturnType<typeof deriveVtolProfile>["subtype"],
): boolean {
    const normalized = label.trim().toLowerCase();
    if (!normalized || normalized.startsWith("function ")) {
        return false;
    }

    if (subtype === "tiltrotor") {
        return /tilt|vector|transition/.test(normalized);
    }

    if (subtype === "tailsitter") {
        return /tailsit|elevon|v-tail|ruddervator|vector/.test(normalized);
    }

    return /tilt|transition|vtol|elevon|tailsit|vector/.test(normalized);
}

function deriveServoOutputGroups(
    indices: number[],
    params: ParamInputParams,
    subtype: ReturnType<typeof deriveVtolProfile>["subtype"],
): ServoOutputGroup[] {
    const vtolIndices: number[] = [];
    const motorIndices: number[] = [];
    const generalIndices: number[] = [];

    for (const index of indices) {
        const functionValue = getStagedOrCurrent(`SERVO${index}_FUNCTION`, params);
        if (isMotorServoFunction(functionValue)) {
            motorIndices.push(index);
            continue;
        }

        const label = resolveServoFunctionLabel(index, params);
        if (subtype && matchesVtolServoKeyword(label, subtype)) {
            vtolIndices.push(index);
            continue;
        }

        generalIndices.push(index);
    }

    const groups: ServoOutputGroup[] = [];

    if (vtolIndices.length > 0) {
        groups.push({
            id: "vtol",
            title: subtype === "tiltrotor"
                ? "VTOL Transition & Tilt Outputs"
                : subtype === "tailsitter"
                    ? "Tailsitter Control Outputs"
                    : "VTOL Control Outputs",
            description: subtype === "tiltrotor"
                ? "These outputs look like tilt or transition servos. Verify travel and reversal before the first transition test."
                : subtype === "tailsitter"
                    ? "These outputs look like tailsitter surfaces or transition servos. Keep reversal and trim aligned before live testing."
                    : "These outputs look VTOL-specific and stay editable here instead of on the motor surface.",
            indices: vtolIndices,
        });
    }

    if (motorIndices.length > 0) {
        groups.push({
            id: "motors",
            title: "Auto-assigned lift motors",
            description: "These outputs are on motor functions. Review them here, but keep function ownership aligned with the frame and motor setup sections.",
            indices: motorIndices,
        });
    }

    if (generalIndices.length > 0 || groups.length === 0) {
        groups.push({
            id: "general",
            title: groups.length === 0 ? "Configured outputs" : "Other configured outputs",
            description: groups.length === 0
                ? "All configured outputs stay editable here."
                : "Outputs without VTOL-specific labels stay grouped here so incomplete metadata does not hide them.",
            indices: generalIndices,
        });
    }

    return groups.filter((group) => group.indices.length > 0);
}

function ServoRowGroup({
    group,
    params,
}: {
    group: ServoOutputGroup;
    params: ParamInputParams;
}) {
    return (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <div className="mb-3 flex flex-col gap-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    {group.title}
                </h3>
                <p className="text-xs text-text-secondary">
                    {group.description}
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {group.indices.map((index) => (
                    <ServoRow key={index} index={index} params={params} />
                ))}
            </div>
        </div>
    );
}

function ServoTesterCard({
    params,
    telemetry,
}: {
    params: ParamInputParams;
    telemetry: Telemetry | null;
}) {
    const targets = useMemo(
        () => deriveServoTestTargets(params),
        [params.store, params.staged, params.metadata],
    );
    const supportedTargets = useMemo(
        () => targets.filter((target) => target.supported),
        [targets],
    );
    const unsupportedTargets = useMemo(
        () => targets.filter((target) => !target.supported),
        [targets],
    );

    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [commandedPwm, setCommandedPwm] = useState<number>(1500);
    const [activeCommand, setActiveCommand] = useState<{
        index: number;
        pwm: number;
    } | null>(null);
    const [lastCommand, setLastCommand] = useState<{
        index: number;
        pwm: number;
    } | null>(null);
    const [commandError, setCommandError] = useState<string | null>(null);

    useEffect(() => {
        if (!supportedTargets.some((target) => target.index === selectedIndex)) {
            setSelectedIndex(supportedTargets[0]?.index ?? null);
        }
    }, [selectedIndex, supportedTargets]);

    const selectedTarget = useMemo(
        () => supportedTargets.find((target) => target.index === selectedIndex) ?? null,
        [selectedIndex, supportedTargets],
    );

    useEffect(() => {
        if (!selectedTarget) return;
        setCommandedPwm(selectedTarget.defaultPwm);
        setCommandError(null);
    }, [selectedTarget]);

    const liveReadback = selectedTarget
        ? readServoOutputPwm(selectedTarget.index, telemetry)
        : null;
    const hasLiveServoFrame = Array.isArray(telemetry?.servo_outputs);
    const selectedLastCommand =
        selectedTarget && lastCommand?.index === selectedTarget.index ? lastCommand : null;
    const selectedActiveCommand =
        selectedTarget && activeCommand?.index === selectedTarget.index ? activeCommand : null;

    const updateCommandedPwm = useCallback(
        (nextValue: number) => {
            if (!selectedTarget || !Number.isFinite(nextValue)) return;
            setCommandedPwm(clampTargetPwm(selectedTarget, nextValue));
        },
        [selectedTarget],
    );

    const sendServoCommand = useCallback(
        async (requestedPwm: number) => {
            if (!selectedTarget) return;

            const safePwm = clampTargetPwm(selectedTarget, requestedPwm);
            setActiveCommand({ index: selectedTarget.index, pwm: safePwm });
            setCommandError(null);
            setCommandedPwm(safePwm);

            try {
                await setServo(selectedTarget.index, safePwm);
                setLastCommand({ index: selectedTarget.index, pwm: safePwm });
            } catch (error) {
                setCommandError(asErrorMessage(error));
            } finally {
                setActiveCommand(null);
            }
        },
        [selectedTarget],
    );

    const statusCopy = selectedTarget
        ? selectedActiveCommand
            ? {
                tone: "border-accent/20 bg-accent/5 text-accent",
                body: `Sending ${formatPwm(selectedActiveCommand.pwm)} to ${selectedTarget.functionLabel} on ${selectedTarget.outputLabel}.`,
            }
            : commandError
                ? {
                    tone: "border-danger/20 bg-danger/5 text-danger",
                    body: `Servo test failed: ${commandError}`,
                }
                : selectedLastCommand
                    ? liveReadback != null
                        ? {
                            tone: "border-success/20 bg-success/5 text-success",
                            body: `Last command ${formatPwm(selectedLastCommand.pwm)}. Live readback is ${formatPwm(liveReadback)}.`,
                        }
                        : !hasLiveServoFrame
                            ? {
                                tone: "border-warning/20 bg-warning/5 text-warning",
                                body: `Last command ${formatPwm(selectedLastCommand.pwm)} sent. Waiting for live servo output telemetry.`,
                            }
                            : {
                                tone: "border-warning/20 bg-warning/5 text-warning",
                                body: `Last command ${formatPwm(selectedLastCommand.pwm)} sent, but ${selectedTarget.outputLabel} is missing from the latest readback frame.`,
                            }
                    : !hasLiveServoFrame
                        ? {
                            tone: "border-warning/20 bg-warning/5 text-warning",
                            body: "Waiting for live servo output telemetry. Commands stay manual until readback arrives.",
                        }
                        : liveReadback == null
                            ? {
                                tone: "border-warning/20 bg-warning/5 text-warning",
                                body: `${selectedTarget.outputLabel} is not present in the current live servo readback frame.`,
                            }
                            : {
                                tone: "border-border bg-bg-secondary/60 text-text-secondary",
                                body: `Live readback ${formatPwm(liveReadback)}. Adjust the target PWM, then send an explicit test command.`,
                            }
        : null;

    return (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Gauge} title="Servo Tester" />

            <div className="flex flex-col gap-4">
                <p className="text-xs leading-relaxed text-text-secondary">
                    Select a configured non-motor output, then send an explicit trim or raw
                    PWM command. Commands stay inside the bridged 1000–2000 µs safety window,
                    and live servo telemetry provides the readback proof.
                </p>

                {targets.length === 0 ? (
                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2.5 text-xs text-text-muted">
                        No configured non-motor servo outputs are available for live testing yet.
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                                    Test targets
                                </span>
                                <span className="text-[10px] text-text-muted">
                                    {supportedTargets.length} supported / {unsupportedTargets.length} unavailable
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                                {supportedTargets.map((target) => {
                                    const selected = target.index === selectedTarget?.index;
                                    return (
                                        <button
                                            key={target.index}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => setSelectedIndex(target.index)}
                                            className={`rounded-md border px-3 py-2 text-left transition-colors ${selected
                                                ? "border-accent/40 bg-accent/10 text-accent"
                                                : "border-border bg-bg-secondary text-text-secondary hover:bg-bg-tertiary/50"
                                                }`}
                                        >
                                            <div className="text-xs font-medium text-inherit">
                                                {target.functionLabel}
                                            </div>
                                            <div className="font-mono text-[10px] uppercase tracking-wider text-current/80">
                                                {target.outputLabel}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {unsupportedTargets.length > 0 && (
                            <div className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-text-secondary">
                                <div className="mb-1 text-[10px] uppercase tracking-wider text-warning">
                                    Unavailable in live tester
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {unsupportedTargets.map((target) => (
                                        <span
                                            key={target.index}
                                            className="rounded bg-warning/10 px-2 py-1 font-mono text-[10px] text-warning"
                                        >
                                            {target.outputLabel} · {target.functionLabel}
                                        </span>
                                    ))}
                                </div>
                                <p className="mt-2 text-[11px] text-text-secondary">
                                    {unsupportedTargets[0]?.unavailableReason}
                                </p>
                            </div>
                        )}

                        {!selectedTarget ? (
                            <div className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-text-secondary">
                                The current configuration only exposes SERVO17–32 targets, which are
                                outside the live tester bridge surface.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                            Target
                                        </div>
                                        <div className="mt-1 text-xs font-medium text-text-primary">
                                            {selectedTarget.functionLabel}
                                        </div>
                                        <div className="font-mono text-[10px] text-text-muted">
                                            {selectedTarget.outputLabel}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                            Safe range
                                        </div>
                                        <div className="mt-1 text-xs font-medium text-text-primary">
                                            {formatPwm(selectedTarget.minPwm)} – {formatPwm(selectedTarget.maxPwm)}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                            Trim default
                                        </div>
                                        <div className="mt-1 text-xs font-medium text-text-primary">
                                            {formatPwm(selectedTarget.trimPwm)}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2">
                                        <div className="text-[10px] uppercase tracking-wider text-text-muted">
                                            Commanded
                                        </div>
                                        <div className="mt-1 text-xs font-medium text-text-primary">
                                            {formatPwm(commandedPwm)}
                                        </div>
                                    </div>
                                </div>

                                <div
                                    aria-live="polite"
                                    className={`rounded-md border px-3 py-2.5 text-xs ${statusCopy?.tone ?? "border-border bg-bg-secondary/60 text-text-secondary"}`}
                                >
                                    <div className="flex items-start gap-2">
                                        {selectedActiveCommand ? (
                                            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin" />
                                        ) : commandError ? (
                                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        ) : (
                                            <Info size={14} className="mt-0.5 shrink-0" />
                                        )}
                                        <span>{statusCopy?.body}</span>
                                    </div>
                                </div>

                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <div className="rounded-md border border-border bg-bg-secondary/60 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="text-[10px] uppercase tracking-wider text-text-muted">
                                                Raw PWM command
                                            </span>
                                            <span className="text-xs font-medium text-text-primary">
                                                {formatPwm(commandedPwm)}
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            <input
                                                aria-label={`Raw PWM slider for ${selectedTarget.outputLabel}`}
                                                type="range"
                                                min={selectedTarget.minPwm}
                                                max={selectedTarget.maxPwm}
                                                step={1}
                                                value={commandedPwm}
                                                onChange={(event) => updateCommandedPwm(Number(event.target.value))}
                                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-bg-tertiary accent-accent"
                                            />

                                            <div className="flex items-center gap-2">
                                                <label
                                                    htmlFor={`servo-pwm-input-${selectedTarget.index}`}
                                                    className="text-[10px] uppercase tracking-wider text-text-muted"
                                                >
                                                    PWM
                                                </label>
                                                <input
                                                    id={`servo-pwm-input-${selectedTarget.index}`}
                                                    aria-label={`Raw PWM input for ${selectedTarget.outputLabel}`}
                                                    type="number"
                                                    min={selectedTarget.minPwm}
                                                    max={selectedTarget.maxPwm}
                                                    step={1}
                                                    value={commandedPwm}
                                                    onChange={(event) => updateCommandedPwm(Number(event.target.value))}
                                                    className="w-28 rounded border border-border bg-bg-input px-2 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none"
                                                />
                                                <span className="text-[10px] text-text-muted">µs</span>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => void sendServoCommand(selectedTarget.trimPwm)}
                                                    disabled={selectedActiveCommand != null}
                                                >
                                                    Send trim
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={() => void sendServoCommand(commandedPwm)}
                                                    disabled={selectedActiveCommand != null}
                                                >
                                                    Send PWM
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-md border border-border bg-bg-secondary/60 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <span className="text-[10px] uppercase tracking-wider text-text-muted">
                                                Live readback
                                            </span>
                                            <span className="font-mono text-[11px] text-text-primary">
                                                {liveReadback != null ? formatPwm(liveReadback) : "--"}
                                            </span>
                                        </div>

                                        {liveReadback != null ? (
                                            <div className="flex flex-col gap-2">
                                                <PwmChannelBars
                                                    items={[
                                                        {
                                                            key: `servo-${selectedTarget.index}`,
                                                            channel: selectedTarget.index,
                                                            label: selectedTarget.outputLabel,
                                                            value: liveReadback,
                                                            annotations: [selectedTarget.functionLabel],
                                                        },
                                                    ]}
                                                    className="sm:grid-cols-1 xl:grid-cols-1"
                                                />
                                                <p className="text-[10px] text-text-muted">
                                                    Readback comes from telemetry.servo_outputs[{selectedTarget.index - 1}] when the vehicle publishes it.
                                                </p>
                                            </div>
                                        ) : !hasLiveServoFrame ? (
                                            <p className="text-xs text-text-muted">
                                                Waiting for live servo output telemetry before readback can confirm the command.
                                            </p>
                                        ) : (
                                            <p className="text-xs text-text-muted">
                                                {selectedTarget.outputLabel} is not present in the latest servo readback frame.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function ServoRow({
    index,
    params,
}: {
    index: number;
    params: ParamInputParams;
}) {
    const prefix = `SERVO${index}`;
    const functionParam = `${prefix}_FUNCTION`;
    const functionValue = params.store?.params[functionParam]?.value ?? null;
    const stagedFunction = params.staged.get(functionParam);
    const isMotor = isMotorServoFunction(stagedFunction ?? functionValue);

    return (
        <div
            className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${isMotor
                ? "border-warning/20 bg-warning/5"
                : "border-border bg-bg-tertiary/50"
                }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center">
                    <span className="text-xs font-semibold text-text-primary whitespace-nowrap">
                        {prefix}
                    </span>
                    {isMotor && (
                        <span className="ml-1.5 rounded bg-warning/15 px-1 py-px text-[9px] font-medium text-warning">
                            motor
                        </span>
                    )}
                </div>
                <ParamToggle
                    paramName={`${prefix}_REVERSED`}
                    params={params}
                    label="Rev"
                />
            </div>

            <ParamSelect
                paramName={functionParam}
                params={params}
                label="Function"
            />

            <div className="grid grid-cols-3 gap-2">
                <ParamNumberInput
                    paramName={`${prefix}_MIN`}
                    params={params}
                    label="Min"
                    unit="µs"
                    min={500}
                    max={2200}
                    step={1}
                />
                <ParamNumberInput
                    paramName={`${prefix}_MAX`}
                    params={params}
                    label="Max"
                    unit="µs"
                    min={800}
                    max={2200}
                    step={1}
                />
                <ParamNumberInput
                    paramName={`${prefix}_TRIM`}
                    params={params}
                    label="Trim"
                    unit="µs"
                    min={500}
                    max={2200}
                    step={1}
                />
            </div>
        </div>
    );
}

type ServoOutputsSectionProps = {
    params: ParamInputParams;
    vehicleState: VehicleState | null;
    telemetry: Telemetry | null;
};

export function ServoOutputsSection({
    params,
    vehicleState,
    telemetry,
}: ServoOutputsSectionProps) {
    const profile = useMemo(
        () => deriveVtolProfile(vehicleState, params),
        [vehicleState, params],
    );
    const servoIndices = useMemo(() => detectServoIndices(params), [params.store]);
    const showMotorBanner = useMemo(
        () => hasAnyMotorAssignment(servoIndices, params),
        [servoIndices, params.store, params.staged],
    );
    const showPlaneBanner = profile.isPlane && !profile.quadPlaneEnabled;
    const showVtolBanner = profile.isPlane && profile.quadPlaneEnabled;
    const servoGroups = useMemo(
        () => deriveServoOutputGroups(servoIndices, params, profile.subtype),
        [servoIndices, params.store, params.staged, params.metadata, profile.subtype],
    );

    if (servoIndices.length === 0) {
        return (
            <div className="flex flex-col gap-4 p-4">
                <div className="flex items-start gap-2.5 rounded-lg border border-border bg-bg-tertiary/50 p-4">
                    <Info size={14} className="mt-0.5 shrink-0 text-text-muted" />
                    <span className="text-sm text-text-muted">
                        Servo output parameters not available. Download parameters first.
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 p-4">
            <SetupSectionIntro
                icon={SlidersHorizontal}
                title="Servo Outputs"
                description="Assign functions, set PWM range, reverse direction, and live-test configured control surfaces without changing the per-output editor layout."
                docsUrl={resolveDocsUrl("servo_outputs")}
            />

            {showMotorBanner && <MotorAssignmentBanner />}
            {showPlaneBanner && <PlaneGuidanceBanner />}
            {showVtolBanner && <VtolServoGuidanceBanner subtype={profile.subtype} />}
            <ServoTesterCard params={params} telemetry={telemetry} />

            <div className="flex flex-col gap-4">
                {servoGroups.map((group) => (
                    <ServoRowGroup key={group.id} group={group} params={params} />
                ))}
            </div>
        </div>
    );
}
