import { COMMON_CMD_REF, COPTER_CMD_LIST, FRAME_NONE, FRAME_RELATIVE_ALT } from "./shared";
import type { CommandMetadata } from "./types";

export const DO_CAMERA_COMMAND_IDS = [195, 197, 201, 202, 203, 205, 206, 531, 532, 534, 1000, 2000, 2001, 2500, 2501] as const;

export const DO_CAMERA_COMMAND_METADATA: Record<number, CommandMetadata> = {
    195: {
        id: 195,
        category: "do",
        summary: "Point the nose/gimbal at a location (persists until cleared).",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi-location`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home." },
        },
        typedFields: {},
        notes: [
            "ROI persists until end of mission or until cleared with DO_SET_ROI_NONE.",
        ],
    },

    197: {
        id: 197,
        category: "do",
        summary: "Clear the current ROI (region of interest).",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi-none`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {},
        notes: ["Cancels any active DO_SET_ROI_LOCATION."],
    },

    201: {
        id: 201,
        category: "do",
        summary: "Set a region-of-interest target with an explicit mode and location.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Mode", description: "ROI operating mode to use." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "ROI altitude relative to home." },
        },
        typedFields: {
            mode: {
                label: "Mode",
                description: "ROI operating mode to use.",
            },
        },
        notes: ["Like other ROI commands, this state persists until cleared or replaced."],
    },

    202: {
        id: 202,
        category: "do",
        summary: "Configure camera shooting parameters for a digital camera.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-digicam-configure`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            shooting_mode: { label: "Shooting Mode", description: "Camera shooting mode selector." },
            shutter_speed: { label: "Shutter Speed", description: "Camera shutter speed setting." },
            aperture: { label: "Aperture", description: "Lens aperture setting." },
            iso: { label: "ISO", description: "Camera ISO sensitivity." },
            exposure_type: { label: "Exposure Type", description: "Exposure program selection." },
            cmd_id: { label: "Command ID", description: "Camera-specific command identifier." },
            cutoff_time: { label: "Cutoff Time", description: "Additional camera cutoff timing parameter." },
        },
    },

    203: {
        id: 203,
        category: "do",
        summary: "Issue an immediate digital camera control command.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-digicam-control`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            session: { label: "Session", description: "Camera session control value." },
            zoom_pos: { label: "Zoom Position", description: "Absolute zoom position." },
            zoom_step: { label: "Zoom Step", description: "Relative zoom step command." },
            focus_lock: { label: "Focus Lock", description: "Whether focus should be locked." },
            shooting_cmd: { label: "Shooting Command", description: "Immediate shooting command value." },
            cmd_id: { label: "Command ID", description: "Camera-specific command identifier." },
        },
    },

    205: {
        id: 205,
        category: "do",
        summary: "Command gimbal mount pitch, roll, and yaw angles.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-mount-control`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Pitch", units: "deg", description: "Target mount pitch angle." },
            param2: { label: "Roll", units: "deg", description: "Target mount roll angle." },
            param3: { label: "Yaw", units: "deg", description: "Target mount yaw angle." },
        },
        typedFields: {
            pitch_deg: { label: "Pitch", units: "deg", description: "Target mount pitch angle." },
            roll_deg: { label: "Roll", units: "deg", description: "Target mount roll angle." },
            yaw_deg: { label: "Yaw", units: "deg", description: "Target mount yaw angle." },
        },
    },

    206: {
        id: 206,
        category: "do",
        summary: "Trigger the camera shutter at a distance interval.",
        docsUrl: `${COPTER_CMD_LIST}#do-set-cam-trigg-dist`,
        frame: FRAME_NONE,
        params: {
            param1: {
                label: "Distance",
                units: "m",
                required: true,
                description: "Trigger every N meters. 0 = stop triggering.",
            },
            param3: {
                label: "Trigger Once",
                description: "1 = trigger once immediately, 0 = off.",
                enumValues: [
                    { value: 1, label: "Yes" },
                    { value: 0, label: "No" },
                ],
            },
        },
        typedFields: {
            meters: {
                label: "Distance",
                units: "m",
                required: true,
                description: "Trigger every N meters. 0 = stop triggering.",
            },
            trigger_now: {
                label: "Trigger Once",
                description: "Trigger the shutter immediately when the command executes.",
            },
        },
        notes: ["Set distance to 0 to stop distance-based triggering."],
    },

    531: {
        id: 531,
        category: "do",
        summary: "Adjust the camera zoom mode and zoom amount.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-zoom`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Zoom Type", description: "Camera zoom control mode." },
            param2: { label: "Zoom Value", description: "Zoom amount or level." },
        },
        typedFields: {
            zoom_type: { label: "Zoom Type", description: "Camera zoom control mode." },
            zoom_value: { label: "Zoom Value", description: "Zoom amount or level." },
        },
    },

    532: {
        id: 532,
        category: "do",
        summary: "Adjust the camera focus mode and focus amount.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-focus`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Focus Type", description: "Camera focus control mode." },
            param2: { label: "Focus Value", description: "Focus amount or target." },
        },
        typedFields: {
            focus_type: { label: "Focus Type", description: "Camera focus control mode." },
            focus_value: { label: "Focus Value", description: "Focus amount or target." },
        },
    },

    534: {
        id: 534,
        category: "do",
        summary: "Select the active primary and secondary camera sources.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-source`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to address." },
            param2: { label: "Primary", description: "Primary camera source." },
            param3: { label: "Secondary", description: "Secondary camera source." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to address." },
            primary: { label: "Primary", description: "Primary camera source." },
            secondary: { label: "Secondary", description: "Secondary camera source." },
        },
    },

    1000: {
        id: 1000,
        category: "do",
        summary: "Command a gimbal manager pitch/yaw target and rates.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-gimbal-manager-pitchyaw`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            pitch_deg: { label: "Pitch", units: "deg", description: "Target gimbal pitch angle." },
            yaw_deg: { label: "Yaw", units: "deg", description: "Target gimbal yaw angle." },
            pitch_rate_dps: { label: "Pitch Rate", units: "deg/s", description: "Pitch slew rate limit." },
            yaw_rate_dps: { label: "Yaw Rate", units: "deg/s", description: "Yaw slew rate limit." },
            flags: { label: "Flags", description: "Gimbal-manager behavior flags." },
            gimbal_id: { label: "Gimbal ID", description: "Specific gimbal instance to control." },
        },
    },

    2000: {
        id: 2000,
        category: "do",
        summary: "Start an image capture sequence.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-image-start-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to use." },
            param2: { label: "Interval", units: "s", description: "Time between captures." },
            param3: { label: "Total Images", description: "0 = capture until stopped." },
            param4: { label: "Start Number", description: "Image sequence start number." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to use." },
            interval_s: { label: "Interval", units: "s", description: "Time between captures." },
            total_images: { label: "Total Images", description: "0 = capture until stopped." },
            start_number: { label: "Start Number", description: "Image sequence start number." },
        },
    },

    2001: {
        id: 2001,
        category: "do",
        summary: "Stop an active image capture sequence.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-image-stop-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to stop." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to stop." },
        },
    },

    2500: {
        id: 2500,
        category: "do",
        summary: "Start video capture on a stream.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-video-start-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Stream ID", description: "Video stream identifier." },
        },
        typedFields: {
            stream_id: { label: "Stream ID", description: "Video stream identifier." },
        },
    },

    2501: {
        id: 2501,
        category: "do",
        summary: "Stop video capture on a stream.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-video-stop-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Stream ID", description: "Video stream identifier." },
        },
        typedFields: {
            stream_id: { label: "Stream ID", description: "Video stream identifier." },
        },
    },
};
