import { describe, it, expect } from "vitest";
import { commandName, commandFullName, MAV_CMD } from "./mav-commands";

describe("commandName", () => {
    it("returns short name for known command", () => {
        expect(commandName(16)).toBe("Waypoint");
        expect(commandName(20)).toBe("RTL");
        expect(commandName(22)).toBe("Takeoff");
    });

    it("returns fallback for unknown command", () => {
        expect(commandName(99999)).toBe("CMD 99999");
    });
});

describe("commandFullName", () => {
    it("returns full name for known command", () => {
        expect(commandFullName(16)).toBe("NAV_WAYPOINT");
        expect(commandFullName(177)).toBe("DO_JUMP");
    });

    it("returns fallback for unknown command", () => {
        expect(commandFullName(99999)).toBe("MAV_CMD_99999");
    });
});

describe("MAV_CMD table", () => {
    it("has entries for all navigation commands", () => {
        expect(MAV_CMD[16]).toEqual({ name: "NAV_WAYPOINT", short: "Waypoint" });
        expect(MAV_CMD[17]).toEqual({ name: "NAV_LOITER_UNLIM", short: "Loiter" });
        expect(MAV_CMD[21]).toEqual({ name: "NAV_LAND", short: "Land" });
        expect(MAV_CMD[22]).toEqual({ name: "NAV_TAKEOFF", short: "Takeoff" });
        expect(MAV_CMD[36]).toEqual({ name: "NAV_ARC_WAYPOINT", short: "Arc Waypoint" });
        expect(MAV_CMD[213]).toEqual({ name: "NAV_SET_YAW_SPEED", short: "Set Yaw Speed" });
        expect(MAV_CMD[42702]).toEqual({ name: "NAV_SCRIPT_TIME", short: "Script Time" });
        expect(MAV_CMD[42703]).toEqual({ name: "NAV_ATTITUDE_TIME", short: "Attitude Time" });
    });

    it("has entries for fence and rally commands", () => {
        expect(MAV_CMD[5001]).toEqual({ name: "NAV_FENCE_RETURN_POINT", short: "Fence Return" });
        expect(MAV_CMD[5100]).toEqual({ name: "NAV_RALLY_POINT", short: "Rally Point" });
    });

    it("contains the current curated command set size", () => {
        expect(Object.keys(MAV_CMD)).toHaveLength(81);
    });

    it("contains all typed-variant command IDs used by the picker", () => {
        const requiredIds = [
            16, 17, 18, 19, 20, 21, 22, 30, 31, 36, 82, 83, 84, 85, 92, 93, 94, 112, 114, 115,
            177, 178, 179, 181, 182, 183, 184, 188, 189, 191, 193, 194, 195, 197, 201, 202, 203,
            205, 206, 207, 208, 210, 211, 212, 213, 215, 216, 217, 218, 222, 223, 531, 532, 534,
            600, 601, 1000, 2000, 2001, 2500, 2501, 3000, 42600, 42702, 42703,
        ];

        expect(requiredIds).toHaveLength(65);
        for (const id of requiredIds) {
            expect(MAV_CMD[id]).toBeDefined();
        }
    });

    it("uses the corrected mount-control and camera-trigger IDs", () => {
        expect(MAV_CMD[205]).toEqual({ name: "DO_MOUNT_CONTROL", short: "Mount Ctrl" });
        expect(MAV_CMD[206]).toEqual({ name: "DO_SET_CAM_TRIGG_DIST", short: "Cam Trig Dist" });
        expect(MAV_CMD[252]).toBeUndefined();
    });

    it("has entries for newly-added do/camera/script commands", () => {
        expect(MAV_CMD[188]).toEqual({ name: "DO_RETURN_PATH_START", short: "Return Path Start" });
        expect(MAV_CMD[207]).toEqual({ name: "DO_FENCE_ENABLE", short: "Fence Enable" });
        expect(MAV_CMD[208]).toEqual({ name: "DO_PARACHUTE", short: "Parachute" });
        expect(MAV_CMD[211]).toEqual({ name: "DO_GRIPPER", short: "Gripper" });
        expect(MAV_CMD[531]).toEqual({ name: "SET_CAMERA_ZOOM", short: "Camera Zoom" });
        expect(MAV_CMD[534]).toEqual({ name: "SET_CAMERA_SOURCE", short: "Camera Source" });
        expect(MAV_CMD[600]).toEqual({ name: "JUMP_TAG", short: "Tag" });
        expect(MAV_CMD[601]).toEqual({ name: "DO_JUMP_TAG", short: "Jump Tag" });
        expect(MAV_CMD[1000]).toEqual({ name: "DO_GIMBAL_MANAGER_PITCHYAW", short: "Gimbal Pitch/Yaw" });
        expect(MAV_CMD[2000]).toEqual({ name: "IMAGE_START_CAPTURE", short: "Image Start" });
        expect(MAV_CMD[3000]).toEqual({ name: "DO_VTOL_TRANSITION", short: "VTOL Transition" });
        expect(MAV_CMD[42600]).toEqual({ name: "DO_WINCH", short: "Winch" });
    });

    it("uses only positive integer command IDs", () => {
        for (const key of Object.keys(MAV_CMD)) {
            const id = Number(key);
            expect(Number.isInteger(id)).toBe(true);
            expect(id).toBeGreaterThan(0);
        }
    });

    it("all entries have both name and short fields", () => {
        for (const [, entry] of Object.entries(MAV_CMD)) {
            expect(typeof entry.name).toBe("string");
            expect(entry.name.length).toBeGreaterThan(0);
            expect(typeof entry.short).toBe("string");
            expect(entry.short.length).toBeGreaterThan(0);
        }
    });

    it("returns distinct short and full names for known commands", () => {
        expect(commandName(16)).toBe("Waypoint");
        expect(commandFullName(16)).toBe("NAV_WAYPOINT");
        expect(commandName(16)).not.toBe(commandFullName(16));
    });
});
