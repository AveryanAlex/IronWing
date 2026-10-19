// Compile-time domain contracts, checked by check:frontend:types.
import type { Airframe, FrameClass, FrameType, MotorRotation, MotorNumber } from "./airframe";
import type { ArduPilotFrameClass, ArduPilotFrameType } from "./ardupilot/airframe";

type Assert<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
type Reject<A, B> = Assignable<A, B> extends false ? true : false;

type ValidTri = Assert<Assignable<{ frameClass: FrameClass.Tri; frameType: FrameType.TriPitchReversed }, Airframe>>;
type TriCannotBeQuadX = Assert<Reject<{ frameClass: FrameClass.Tri; frameType: FrameType.X }, Airframe>>;
type QuadCannotBeY6 = Assert<Reject<{ frameClass: FrameClass.Quad; frameType: FrameType.Y6B }, Airframe>>;
type ClassIsNotType = Assert<Reject<FrameClass, FrameType>>;
type ClassIsNotRotation = Assert<Reject<FrameClass, MotorRotation>>;
type WireClassIsNotDomainClass = Assert<Reject<ArduPilotFrameClass, FrameClass>>;
type WireTypeIsNotDomainType = Assert<Reject<ArduPilotFrameType, FrameType>>;
type WireClassIsNotWireType = Assert<Reject<ArduPilotFrameClass, ArduPilotFrameType>>;
type RawNumberIsNotFrameClass = Assert<Reject<number, FrameClass>>;

type OutOfRangeMotorIsNotMotorNumber = Assert<Reject<33, MotorNumber>>;
type RawNumberIsNotMotorNumber = Assert<Reject<number, MotorNumber>>;
