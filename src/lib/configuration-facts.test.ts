import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeOverallProgress } from "../hooks/use-setup-sections";

const { listen } = vi.hoisted(() => ({
    listen: vi.fn(),
}));

vi.mock("@platform/event", () => ({
    listen,
}));

import { subscribeConfigurationFacts } from "../configuration-facts";
import { deriveSetupSectionStatuses } from "./configuration-facts";

describe("configuration facts domain", () => {
    beforeEach(() => {
        listen.mockReset();
    });

    it("unwraps scoped configuration_facts payloads from Rust", async () => {
        const domain = {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
                frame: { configured: true },
                gps: { configured: true },
            },
        } as const;
        const cb = vi.fn();

        listen.mockImplementation(async (_event, handler) => {
            handler({
                payload: {
                    envelope: {
                        session_id: "session-7",
                        source_kind: "live",
                        seek_epoch: 0,
                        reset_revision: 0,
                    },
                    value: domain,
                },
            });
            return () => { };
        });

        await subscribeConfigurationFacts(cb);

        expect(cb).toHaveBeenCalledWith(domain);
    });
});

describe("deriveSetupSectionStatuses", () => {
    it("does not treat support availability alone as arming readiness", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    can_request_prearm_checks: true,
                    can_calibrate_accel: true,
                    can_calibrate_compass: true,
                    can_calibrate_radio: true,
                } as never,
            },
            sensor_health: {
                available: true,
                complete: true,
                provenance: "stream",
                value: { gyro: "unhealthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" },
            },
            configuration_facts: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    frame: { configured: true },
                    gps: { configured: true },
                    battery_monitor: { configured: true },
                    motors_esc: { configured: true },
                },
            },
            calibration: {
                available: false,
                complete: false,
                provenance: "stream",
                value: null,
            },
        });

        expect(statuses.get("arming")).toBe("in_progress");
    });

    it("does not auto-complete fixed-wing frame setup without backend confirmation", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "fixed_wing",
            confirmed_sections: {},
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    frame: null,
                    gps: null,
                    battery_monitor: null,
                    motors_esc: null,
                },
            },
            calibration: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
        });

        expect(statuses.get("frame_orientation")).toBe("unknown");
    });

    it("marks fixed-wing frame setup complete only when backend facts say so", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "fixed_wing",
            confirmed_sections: {},
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    frame: { configured: true },
                    gps: null,
                    battery_monitor: null,
                    motors_esc: null,
                },
            },
            calibration: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
        });

        expect(statuses.get("frame_orientation")).toBe("complete");
    });

    it("derives setup readiness from backend facts instead of probing raw params", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    can_request_prearm_checks: true,
                    can_calibrate_accel: true,
                    can_calibrate_compass: true,
                    can_calibrate_radio: true,
                } as never,
            },
            sensor_health: {
                available: true,
                complete: true,
                provenance: "stream",
                value: { gyro: "healthy", accel: "healthy", mag: "healthy", baro: "healthy", gps: "healthy", airspeed: "not_present", rc_receiver: "healthy", battery: "healthy", terrain: "not_present", geofence: "not_present" },
            },
            configuration_facts: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    frame: { configured: true },
                    gps: { configured: true },
                    battery_monitor: { configured: true },
                    motors_esc: null,
                },
            },
            calibration: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    accel: { lifecycle: "complete", progress: null, report: null },
                    compass: {
                        lifecycle: "complete",
                        progress: null,
                        report: {
                            compass_id: 1,
                            status: "success",
                            fitness: 12,
                            ofs_x: 1,
                            ofs_y: 2,
                            ofs_z: 3,
                            autosaved: true,
                        },
                    },
                    radio: { lifecycle: "complete", progress: null, report: null },
                } as never,
            },
        });

        expect(statuses.get("frame_orientation")).toBe("complete");
        expect(statuses.get("gps")).toBe("complete");
        expect(statuses.get("battery_monitor")).toBe("complete");
        expect(statuses.get("motors_esc")).toBe("unknown");
        expect(statuses.get("calibration")).toBe("complete");
        expect(statuses.get("arming")).toBe("complete");
    });

    it("treats partial calibration progress from the calibration domain as in_progress", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    frame: null,
                    gps: null,
                    battery_monitor: null,
                    motors_esc: null,
                },
            },
            calibration: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    accel: { lifecycle: "complete", progress: null, report: null },
                    compass: {
                        lifecycle: "running",
                        progress: {
                            compass_id: 1,
                            completion_pct: 42,
                            status: "running_step_one",
                            attempt: 1,
                        },
                        report: null,
                    },
                    radio: { lifecycle: "not_started", progress: null, report: null },
                } as never,
            },
        });

        expect(statuses.get("calibration")).toBe("in_progress");
        expect(computeOverallProgress(statuses).completed).toBe(0);
    });

    it("treats grouped calibration lifecycle/progress facts as setup progress", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    frame: { configured: true },
                    gps: null,
                    battery_monitor: null,
                    motors_esc: null,
                },
            },
            calibration: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    accel: {
                        lifecycle: "complete",
                        progress: null,
                        report: null,
                    },
                    compass: {
                        lifecycle: "running",
                        progress: {
                            compass_id: 1,
                            completion_pct: 42,
                            status: "running_step_one",
                            attempt: 1,
                        },
                        report: null,
                    },
                    radio: {
                        lifecycle: "not_started",
                        progress: null,
                        report: null,
                    },
                } as never,
            },
        });

        expect(statuses.get("calibration")).toBe("in_progress");
    });

    it("preserves failed calibration attempts distinctly from never-started", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            calibration: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    accel: null,
                    compass: {
                        lifecycle: "failed",
                        progress: null,
                        report: {
                            compass_id: 1,
                            status: "failed",
                            fitness: 12,
                            ofs_x: 1,
                            ofs_y: 2,
                            ofs_z: 3,
                            autosaved: false,
                        },
                    },
                    radio: null,
                } as never,
            },
        });

        expect(statuses.get("calibration")).toBe("failed");
    });

    it("keeps unknown facts honest instead of collapsing them to not_started", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {},
            support: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    can_request_prearm_checks: false,
                    can_calibrate_accel: false,
                    can_calibrate_compass: true,
                    can_calibrate_radio: false,
                } as never,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: true,
                complete: false,
                provenance: "stream",
                value: {
                    frame: null,
                    gps: null,
                    battery_monitor: null,
                    motors_esc: null,
                },
            },
            calibration: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
        });

        expect(statuses.get("motors_esc")).toBe("unknown");
        expect(statuses.get("arming")).toBe("unknown");
    });

    it("keeps user-confirmed setup sections frontend-owned", () => {
        const statuses = deriveSetupSectionStatuses({
            vehicle_type: "quadrotor",
            confirmed_sections: {
                flight_modes: true,
                failsafe: false,
                rtl_return: true,
                geofence: false,
                initial_params: true,
                serial_ports: true,
            },
            support: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            sensor_health: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            configuration_facts: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
            calibration: {
                available: false,
                complete: false,
                provenance: "bootstrap",
                value: null,
            },
        });

        expect(statuses.get("flight_modes")).toBe("complete");
        expect(statuses.get("failsafe")).toBe("not_started");
        expect(statuses.get("rtl_return")).toBe("complete");
        expect(statuses.get("geofence")).toBe("not_started");
        expect(statuses.get("initial_params")).toBe("complete");
        expect(statuses.get("serial_ports")).toBe("complete");
    });
});
