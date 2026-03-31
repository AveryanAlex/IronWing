import { useCallback, useMemo, useState } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Gauge,
    Info,
    Loader2,
    Plane,
    SlidersHorizontal,
} from "lucide-react";
import { Button } from "../../ui/button";
import { setServo } from "../../../calibration";
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
    deriveServoTestTargets,
    isMotorServoFunction,
    readServoOutputPwm,
    type ServoTestTarget,
} from "./servo-test-helpers";
import { getDirectionGuidance } from "./servo-direction-guidance";

const MAX_SERVO_INDEX = 32;

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

// ---------------------------------------------------------------------------
// Servo Direction Tester (replaces raw PWM tester)
// ---------------------------------------------------------------------------

type DirectionFunctionGroup = {
    functionValue: number;
    functionLabel: string;
    targets: ServoTestTarget[];
};

function groupTargetsByFunction(targets: ServoTestTarget[]): DirectionFunctionGroup[] {
    const map = new Map<number, DirectionFunctionGroup>();

    for (const target of targets) {
        let group = map.get(target.functionValue);
        if (!group) {
            group = {
                functionValue: target.functionValue,
                functionLabel: target.functionLabel,
                targets: [],
            };
            map.set(target.functionValue, group);
        }
        group.targets.push(target);
    }

    return [...map.values()].sort(
        (a, b) => a.targets[0].index - b.targets[0].index,
    );
}

type DirectionResult = "correct" | "reversed";

function ServoDirectionRow({
    target,
    params,
    telemetry,
}: {
    target: ServoTestTarget;
    params: ParamInputParams;
    telemetry: Telemetry | null;
}) {
    const [activeCommand, setActiveCommand] = useState<"min" | "max" | null>(null);
    const [tested, setTested] = useState(false);
    const [directionResult, setDirectionResult] = useState<DirectionResult | null>(null);
    const [commandError, setCommandError] = useState<string | null>(null);

    const guidance = getDirectionGuidance(target.functionValue);
    const liveReadback = readServoOutputPwm(target.index, telemetry);

    const reversedParam = `SERVO${target.index}_REVERSED`;
    const currentReversed = getStagedOrCurrent(reversedParam, params);
    const reversalStaged = params.staged.has(reversedParam);

    const sendCommand = useCallback(
        async (which: "min" | "max") => {
            if (activeCommand) return;
            const pwm = which === "min" ? target.minPwm : target.maxPwm;
            setActiveCommand(which);
            setCommandError(null);
            try {
                await setServo(target.index, pwm);
                setTested(true);
            } catch (error) {
                setCommandError(
                    error instanceof Error && error.message.trim()
                        ? error.message
                        : "Servo command failed",
                );
            } finally {
                setActiveCommand(null);
            }
        },
        [activeCommand, target.index, target.minPwm, target.maxPwm],
    );

    return (
        <div className="rounded-md border border-border-light bg-bg-secondary/50 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-text-primary">
                        {target.outputLabel}
                    </span>
                    {currentReversed === 1 && (
                        <span className="rounded bg-warning/10 px-1 py-px text-[9px] font-medium text-warning">
                            reversed
                        </span>
                    )}
                </div>
                {liveReadback != null && (
                    <span className="font-mono text-[10px] text-text-muted">
                        {Math.round(liveReadback)} µs
                    </span>
                )}
            </div>

            <div className="mt-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={activeCommand !== null}
                        onClick={() => void sendCommand("min")}
                    >
                        {activeCommand === "min" ? (
                            <><Loader2 size={12} className="animate-spin" /> Sending…</>
                        ) : (
                            `Send Min (${target.minPwm} µs)`
                        )}
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        disabled={activeCommand !== null}
                        onClick={() => void sendCommand("max")}
                    >
                        {activeCommand === "max" ? (
                            <><Loader2 size={12} className="animate-spin" /> Sending…</>
                        ) : (
                            `Send Max (${target.maxPwm} µs)`
                        )}
                    </Button>
                </div>

                <div className="flex gap-4 text-[10px] text-text-muted">
                    <span>Min: {guidance.minLabel}</span>
                    <span>Max: {guidance.maxLabel}</span>
                </div>

                {commandError && (
                    <div className="flex items-center gap-1.5 text-xs text-danger">
                        <AlertTriangle size={12} />
                        <span>{commandError}</span>
                    </div>
                )}

                {tested && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                            Direction
                        </span>
                        <Button
                            variant={directionResult === "correct" ? "default" : "secondary"}
                            size="sm"
                            onClick={() => setDirectionResult("correct")}
                        >
                            Correct
                        </Button>
                        <Button
                            variant={directionResult === "reversed" ? "destructive" : "secondary"}
                            size="sm"
                            onClick={() => setDirectionResult("reversed")}
                        >
                            Reversed
                        </Button>
                        {directionResult && (
                            <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                                    directionResult === "correct"
                                        ? "border-success/30 bg-success/10 text-success"
                                        : "border-danger/30 bg-danger/10 text-danger"
                                }`}
                            >
                                {directionResult === "correct" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                                {directionResult}
                            </span>
                        )}
                        {directionResult === "reversed" && (
                            <Button
                                variant="secondary"
                                size="sm"
                                disabled={reversalStaged}
                                onClick={() => {
                                    params.stage(reversedParam, currentReversed === 1 ? 0 : 1);
                                }}
                            >
                                {reversalStaged
                                    ? "Reversal staged"
                                    : `Reverse ${target.outputLabel}`}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ServoDirectionTester({
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
    const functionGroups = useMemo(
        () => groupTargetsByFunction(supportedTargets),
        [supportedTargets],
    );

    return (
        <div className="rounded-lg border border-border bg-bg-tertiary/50 p-4">
            <SectionCardHeader icon={Gauge} title="Servo Direction Tester" />

            <div className="flex flex-col gap-4">
                <p className="text-xs leading-relaxed text-text-secondary">
                    Test each servo by sending its min and max PWM, observe the physical
                    movement, and confirm the direction matches the expected behavior.
                    If reversed, stage the correction in one click.
                </p>

                {targets.length === 0 ? (
                    <div className="rounded-md border border-border bg-bg-secondary/60 px-3 py-2.5 text-xs text-text-muted">
                        No configured non-motor servo outputs are available for testing yet.
                    </div>
                ) : (
                    <>
                        {functionGroups.length === 0 ? (
                            <div className="rounded-md border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-text-secondary">
                                The current configuration only exposes SERVO17–32 targets, which are
                                outside the live tester bridge surface.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {functionGroups.map((group) => {
                                    const groupGuidance = getDirectionGuidance(group.functionValue);
                                    return (
                                        <div key={group.functionValue} className="flex flex-col gap-2">
                                            <div className="flex flex-col gap-0.5">
                                                <h4 className="text-xs font-semibold text-text-primary">
                                                    {group.functionLabel}
                                                </h4>
                                                <p className="text-[10px] text-text-muted">
                                                    Min → {groupGuidance.minLabel} · Max → {groupGuidance.maxLabel}
                                                </p>
                                            </div>
                                            {group.targets.map((target) => (
                                                <ServoDirectionRow
                                                    key={target.index}
                                                    target={target}
                                                    params={params}
                                                    telemetry={telemetry}
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

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
            <ServoDirectionTester params={params} telemetry={telemetry} />

            <div className="flex flex-col gap-4">
                {servoGroups.map((group) => (
                    <ServoRowGroup key={group.id} group={group} params={params} />
                ))}
            </div>
        </div>
    );
}
