// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionInspector } from "./MissionInspector";
import {
    commandPosition,
    defaultCommand,
    defaultGeoPoint3d,
    geoPoint3dAltitude,
    geoPoint3dLatLon,
    type MissionCommand,
} from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";

afterEach(() => {
    cleanup();
});

const DEFAULT_POSITION = defaultGeoPoint3d(47.3769, 8.5417, 50);

function buildCommand(
    category: "Nav" | "Do" | "Condition",
    variant: string,
    position = DEFAULT_POSITION,
): MissionCommand {
    return defaultCommand(category, variant, position);
}

function buildRawCommand(commandId = 99999): MissionCommand {
    return {
        Other: {
            command: commandId,
            frame: "Mission",
            param1: 1,
            param2: 2,
            param3: 3,
            param4: 4,
            x: 473769000,
            y: 85417000,
            z: 50,
        },
    };
}

function previewForCommand(command: MissionCommand) {
    const position = commandPosition(command);
    if (!position) {
        return {
            latitude_deg: null,
            longitude_deg: null,
            altitude_m: null,
        };
    }

    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(position);
    const { value: altitude_m } = geoPoint3dAltitude(position);
    return { latitude_deg, longitude_deg, altitude_m };
}

function makeDraftItem(
    command: MissionCommand,
    options: { readOnly?: boolean; index?: number; uiId?: number } = {},
): TypedDraftItem {
    return {
        uiId: options.uiId ?? 1,
        index: options.index ?? 0,
        readOnly: options.readOnly ?? false,
        preview: previewForCommand(command),
        document: {
            command,
            current: false,
            autocontinue: true,
        },
    };
}

function renderMissionInspector(options: {
    command: MissionCommand;
    missionType?: "mission" | "fence" | "rally";
    draftReadOnly?: boolean;
    readOnly?: boolean;
    draftItem?: TypedDraftItem;
}) {
    const draftItem = options.draftItem ?? makeDraftItem(options.command, { readOnly: options.draftReadOnly });

    const onUpdateCommand = vi.fn();
    const onUpdateAltitude = vi.fn();
    const onUpdateCoordinate = vi.fn();
    const onSetWaypointFromVehicle = vi.fn();
    const onSelect = vi.fn();

    const result = render(
        <MissionInspector
            missionType={options.missionType ?? "mission"}
            draftItem={draftItem}
            index={draftItem.index}
            previousItem={null}
            homePosition={null}
            readOnly={options.readOnly}
            isSelected
            onUpdateCommand={onUpdateCommand}
            onUpdateAltitude={onUpdateAltitude}
            onUpdateCoordinate={onUpdateCoordinate}
            onSetWaypointFromVehicle={onSetWaypointFromVehicle}
            onSelect={onSelect}
        />,
    );

    return {
        ...result,
        onUpdateCommand,
        onUpdateAltitude,
        onUpdateCoordinate,
        onSetWaypointFromVehicle,
        onSelect,
    };
}

describe("MissionInspector", () => {
    it("renders the set-from-vehicle action for editable mission coordinates and invokes the hook callback", () => {
        const { onSetWaypointFromVehicle } = renderMissionInspector({
            command: buildCommand("Nav", "Waypoint", defaultGeoPoint3d(47.3769, 8.5417, 60)),
        });

        const button = screen.getByRole("button", { name: "Set from Vehicle" });
        fireEvent.click(button);

        expect(onSetWaypointFromVehicle).toHaveBeenCalledWith(0);
    });

    it("hides the set-from-vehicle action when coordinates are hidden, the domain is not mission, or the inspector is read-only", () => {
        const { rerender } = renderMissionInspector({
            command: buildCommand("Nav", "Takeoff", defaultGeoPoint3d(47.3769, 8.5417, 25)),
        });

        expect(screen.queryByRole("button", { name: "Set from Vehicle" })).toBeNull();

        rerender(
            <MissionInspector
                missionType="rally"
                draftItem={makeDraftItem(buildCommand("Nav", "Waypoint"))}
                index={0}
                previousItem={null}
                homePosition={null}
                isSelected
                onUpdateCommand={vi.fn()}
                onUpdateAltitude={vi.fn()}
                onUpdateCoordinate={vi.fn()}
                onSetWaypointFromVehicle={vi.fn()}
                onSelect={vi.fn()}
            />,
        );

        expect(screen.queryByRole("button", { name: "Set from Vehicle" })).toBeNull();

        rerender(
            <MissionInspector
                missionType="mission"
                draftItem={makeDraftItem(buildCommand("Nav", "Waypoint"), { readOnly: false })}
                index={0}
                previousItem={null}
                homePosition={null}
                readOnly
                isSelected
                onUpdateCommand={vi.fn()}
                onUpdateAltitude={vi.fn()}
                onUpdateCoordinate={vi.fn()}
                onSetWaypointFromVehicle={vi.fn()}
                onSelect={vi.fn()}
            />,
        );

        expect(screen.queryByRole("button", { name: "Set from Vehicle" })).toBeNull();
    });

    it("renders waypoint metadata, disabled unsupported fields, coordinates, altitude, and help text", () => {
        const { container } = renderMissionInspector({
            command: buildCommand("Nav", "Waypoint", defaultGeoPoint3d(47.3769, 8.5417, 60)),
        });

        expect(screen.getByText("Fly to a waypoint, optionally hold for a delay.")).toBeTruthy();
        expect(screen.getByText(/Without a delay, the waypoint is considered complete/i)).toBeTruthy();
        expect(screen.getByRole("link", { name: /ArduPilot Docs/i }).getAttribute("href")).toContain("#waypoint");

        expect(screen.getByLabelText("Hold")).toBeTruthy();
        expect((container.querySelector('[data-command-field-unit="hold_time_s"]') as HTMLElement | null)?.textContent).toBe("s");

        expect((screen.getByLabelText("Accept Radius") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Pass Radius") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Yaw") as HTMLInputElement).disabled).toBe(true);
        expect(screen.getByText(/WP_RADIUS_M/)).toBeTruthy();

        expect(container.querySelector('[data-coord-field="latitude"]')).toBeTruthy();
        expect(container.querySelector('[data-coord-field="longitude"]')).toBeTruthy();
        expect(container.querySelector('[data-param-slot="altitude"]')).toBeTruthy();
    });

    it("hides takeoff lat/lon and hidden pitch metadata while still exposing altitude", () => {
        const { container } = renderMissionInspector({
            command: buildCommand("Nav", "Takeoff", defaultGeoPoint3d(47.3769, 8.5417, 25)),
        });

        expect(screen.getByText("Climb straight up to the specified altitude.")).toBeTruthy();
        expect(screen.queryByLabelText("Pitch")).toBeNull();
        expect(screen.queryByText("Coordinates")).toBeNull();
        expect(container.querySelector('[data-coord-field="latitude"]')).toBeNull();
        expect(container.querySelector('[data-coord-field="longitude"]')).toBeNull();
        expect(container.querySelector('[data-param-slot="altitude"]')).toBeTruthy();
    });

    it("renders VTOL land R042 position fields and options metadata", () => {
        const { container } = renderMissionInspector({
            command: buildCommand("Nav", "VtolLand", defaultGeoPoint3d(47.3769, 8.5417, 30)),
        });

        expect(screen.getByText("Perform a VTOL landing at the requested position.")).toBeTruthy();
        expect(screen.getByLabelText("Options")).toBeTruthy();
        expect(container.querySelector('[data-coord-field="latitude"]')).toBeTruthy();
        expect(container.querySelector('[data-coord-field="longitude"]')).toBeTruthy();
        expect(container.querySelector('[data-param-slot="altitude"]')).toBeTruthy();
    });

    it("renders parachute action with exactly the command-specific enum options", () => {
        renderMissionInspector({ command: buildCommand("Do", "Parachute") });

        const actionSelect = screen.getByLabelText("Action") as HTMLSelectElement;
        const optionLabels = within(actionSelect)
            .getAllByRole("option")
            .map((option) => option.textContent);

        expect(screen.getByText("Control the parachute system.")).toBeTruthy();
        expect(optionLabels).toEqual(["Disable", "Enable", "Release"]);
        expect(optionLabels).not.toContain("Climb");
        expect(optionLabels).not.toContain("Disable Floor");
        expect(optionLabels).not.toContain("Grab");
    });

    it("renders winch typed fields and units from metadata", () => {
        const { container } = renderMissionInspector({ command: buildCommand("Do", "Winch") });

        expect(screen.getByLabelText("Winch #")).toBeTruthy();
        expect(screen.getByLabelText("Release Length")).toBeTruthy();
        expect(screen.getByLabelText("Release Rate")).toBeTruthy();
        expect((container.querySelector('[data-command-field-unit="release_length_m"]') as HTMLElement | null)?.textContent).toBe("m");
        expect((container.querySelector('[data-command-field-unit="release_rate_mps"]') as HTMLElement | null)?.textContent).toBe("m/s");

        const actionSelect = screen.getByLabelText("Action") as HTMLSelectElement;
        const optionLabels = within(actionSelect)
            .getAllByRole("option")
            .map((option) => option.textContent);
        expect(optionLabels).toEqual(["Relax", "Length Control", "Rate Control"]);
    });

    it("renders DO_LAND_START position fields plus help summary and docs link", () => {
        const { container } = renderMissionInspector({
            command: buildCommand("Do", "LandStart", defaultGeoPoint3d(47.3769, 8.5417, 45)),
        });

        expect(screen.getByText("Mark the point where the landing sequence begins.")).toBeTruthy();
        expect(screen.getByRole("link", { name: /ArduPilot Docs/i }).getAttribute("href")).toContain("#do-land-start");
        expect(container.querySelector('[data-coord-field="latitude"]')).toBeTruthy();
        expect(container.querySelector('[data-coord-field="longitude"]')).toBeTruthy();
        expect(container.querySelector('[data-param-slot="altitude"]')).toBeTruthy();
    });

    it("renders ReturnToLaunch as a no-field unit variant with help text", () => {
        const { container } = renderMissionInspector({ command: buildCommand("Nav", "ReturnToLaunch") });

        expect(screen.getByText("Return to launch point (or nearest Rally Point) and land.")).toBeTruthy();
        expect(screen.queryByText("Parameters")).toBeNull();
        expect(container.querySelector('[data-coord-field="latitude"]')).toBeNull();
        expect(container.querySelector('[data-coord-field="longitude"]')).toBeNull();
        expect(container.querySelector('[data-param-slot="altitude"]')).toBeNull();
    });

    it("disables editable fields, coordinates, and altitude when readOnly mode is enabled", () => {
        const { container } = renderMissionInspector({
            command: buildCommand("Nav", "Waypoint", defaultGeoPoint3d(47.3769, 8.5417, 55)),
            readOnly: true,
        });

        expect((screen.getByLabelText("Hold") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Accept Radius") as HTMLInputElement).disabled).toBe(true);
        expect((container.querySelector('[data-coord-field="latitude"]') as HTMLInputElement | null)?.disabled).toBe(true);
        expect((container.querySelector('[data-coord-field="longitude"]') as HTMLInputElement | null)?.disabled).toBe(true);
        expect((container.querySelector('[data-param-slot="altitude"]') as HTMLInputElement | null)?.disabled).toBe(true);
    });

    it("renders a raw generic parameter view and banner for unknown read-only commands", () => {
        const { container } = renderMissionInspector({
            command: buildRawCommand(),
            draftReadOnly: true,
        });

        expect(screen.getByText("Raw/unsupported item preserved read-only.")).toBeTruthy();
        expect(screen.getByText(/MAV_CMD_99999 \(no detailed metadata available\)/)).toBeTruthy();
        expect(screen.getByText(/Raw parameter view for MAV_CMD_99999/)).toBeTruthy();

        expect((screen.getByLabelText("Param 1") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Param 4") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Latitude") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Longitude") as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText("Altitude") as HTMLInputElement).disabled).toBe(true);
        expect((container.querySelector('[data-command-field-unit="z"]') as HTMLElement | null)?.textContent).toBe("m");
    });
});
