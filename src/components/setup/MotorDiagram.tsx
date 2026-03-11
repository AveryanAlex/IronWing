import { useMemo } from "react";
import { getMotorLayout, type MotorLayout } from "../../data/motor-layouts";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type MotorDiagramProps = {
  frameClass: number;
  frameType: number;
  activeMotor?: number | null;
  size?: number;
};

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const VIEWBOX = 200;
const CENTER = VIEWBOX / 2;
const SPREAD = 150;
const MOTOR_RADIUS = 22;
const LABEL_FONT_SIZE = 13;

// ---------------------------------------------------------------------------
// CW/CCW arc arrow path generators
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Motor circle + label + rotation indicator
// ---------------------------------------------------------------------------

function MotorCircle({
  motor,
  cx,
  cy,
  isActive,
}: {
  motor: MotorLayout;
  cx: number;
  cy: number;
  isActive: boolean;
}) {
  const isCW = motor.yawFactor > 0;
  const isCCW = motor.yawFactor < 0;
  const hasRotation = isCW || isCCW;

  return (
    <g>
      {/* Active glow ring */}
      {isActive && (
        <circle
          cx={cx}
          cy={cy}
          r={MOTOR_RADIUS + 4}
          className="fill-none stroke-accent"
          strokeWidth={2}
          opacity={0.6}
        >
          <animate
            attributeName="opacity"
            values="0.3;0.8;0.3"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {/* Motor circle */}
      <circle
        cx={cx}
        cy={cy}
        r={MOTOR_RADIUS}
        className={
          isActive
            ? "fill-accent/20 stroke-accent"
            : "fill-bg-secondary stroke-accent"
        }
        strokeWidth={2}
      />

      {/* Rotation arc + arrowhead */}
      {hasRotation && (
        <>
          <path
            d={rotationArcPath(cx, cy, MOTOR_RADIUS, isCW)}
            className="fill-none stroke-accent"
            strokeWidth={1.5}
            opacity={isActive ? 1 : 0.6}
          />
          <polygon
            points={arrowheadPoints(cx, cy, MOTOR_RADIUS, isCW)}
            className="fill-accent"
            opacity={isActive ? 1 : 0.6}
          />
        </>
      )}

      {/* Unknown rotation indicator */}
      {!hasRotation && (
        <text
          x={cx}
          y={cy - MOTOR_RADIUS - 6}
          textAnchor="middle"
          className="fill-text-muted"
          fontSize={8}
        >
          ?
        </text>
      )}

      {/* Motor number label */}
      <text
        x={cx}
        y={cy + LABEL_FONT_SIZE * 0.35}
        textAnchor="middle"
        className={isActive ? "fill-accent" : "fill-text-primary"}
        fontSize={LABEL_FONT_SIZE}
        fontWeight={600}
      >
        {motor.motorNumber}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MotorDiagram({
  frameClass,
  frameType,
  activeMotor = null,
  size = 200,
}: MotorDiagramProps) {
  const layout = useMemo(
    () => getMotorLayout(frameClass, frameType),
    [frameClass, frameType],
  );

  const motorPositions = useMemo(() => {
    if (!layout) return [];
    return layout.motors.map((m) => ({
      motor: m,
      cx: CENTER + m.rollFactor * SPREAD,
      cy: CENTER - m.pitchFactor * SPREAD,
    }));
  }, [layout]);

  if (!layout) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-bg-tertiary/50 text-xs text-text-muted"
        style={{ width: size, height: size }}
      >
        No layout available
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      width={size}
      height={size}
      className="select-none"
    >
      {motorPositions.map(({ motor, cx, cy }) => (
        <line
          key={`arm-${motor.motorNumber}`}
          x1={CENTER}
          y1={CENTER}
          x2={cx}
          y2={cy}
          className="stroke-border-light"
          strokeWidth={6}
          strokeLinecap="round"
        />
      ))}

      <circle
        cx={CENTER}
        cy={CENTER}
        r={8}
        className="fill-bg-tertiary stroke-border"
        strokeWidth={2}
      />

      {motorPositions.map(({ motor, cx, cy }) => (
        <MotorCircle
          key={motor.motorNumber}
          motor={motor}
          cx={cx}
          cy={cy}
          isActive={activeMotor === motor.motorNumber}
        />
      ))}
    </svg>
  );
}
