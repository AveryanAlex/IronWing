import { describe, expect, it } from "vitest";
import { isPeripheralParamExcluded } from "./PeripheralsSection";

describe("isPeripheralParamExcluded", () => {
    it.each([
        "Q_ENABLE",
        "Q_ENABLE_MASK",
        "Q_OPTIONS",
        "Q_A_RAT_RLL_P",
        "Q_M_THST_EXPO",
        "Q_TILT_ENABLE",
        "Q_TILT_MASK",
        "Q_TAILSIT_ENABLE",
        "Q_TAILSIT_ANGLE",
    ])("excludes VTOL-owned param %s from Peripherals auto-discovery", (name) => {
        expect(isPeripheralParamExcluded(name)).toBe(true);
    });

    it("keeps existing non-VTOL setup-owned families excluded", () => {
        expect(isPeripheralParamExcluded("SERVO1_FUNCTION")).toBe(true);
        expect(isPeripheralParamExcluded("GPS_TYPE")).toBe(true);
        expect(isPeripheralParamExcluded("ATC_RAT_RLL_P")).toBe(true);
    });

    it("leaves unrelated peripheral prefixes available for auto-discovery", () => {
        expect(isPeripheralParamExcluded("CAN_P1_DRIVER")).toBe(false);
        expect(isPeripheralParamExcluded("RNGFND1_TYPE")).toBe(false);
        expect(isPeripheralParamExcluded("LGR1_ENABLE")).toBe(false);
    });
});
