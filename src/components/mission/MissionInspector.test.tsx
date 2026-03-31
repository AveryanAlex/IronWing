// @vitest-environment jsdom

import { render, screen, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionInspector } from "./MissionInspector";
import { defaultCommand, defaultGeoPoint3d, type MissionCommand } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";

afterEach(() => {
    cleanup();
});

function makeDraftItem(command: MissionCommand): TypedDraftItem {
    return {
        uiId: 1,
        index: 0,
        readOnly: false,
        preview: {
            latitude_deg: null,
            longitude_deg: null,
            altitude_m: null,
        },
        document: {
            command,
            current: false,
            autocontinue: true,
        },
    };
}

function renderMissionInspector(command: MissionCommand) {
    return render(
        <MissionInspector
            missionType="mission"
            draftItem={makeDraftItem(command)}
            index={0}
            previousItem={null}
            homePosition={null}
            isSelected
            onUpdateCommand={vi.fn()}
            onUpdateAltitude={vi.fn()}
            onUpdateCoordinate={vi.fn()}
            onSelect={vi.fn()}
        />,
    );
}

describe("MissionInspector", () => {
    it("renders metadata-scoped enum options and command help for parachute commands", () => {
        renderMissionInspector(defaultCommand("Do", "Parachute"));

        expect(screen.getByText("Control the parachute system.")).toBeTruthy();
        const docsLink = screen.getByRole("link", { name: /ArduPilot Docs/i });
        expect(docsLink.getAttribute("href")).toContain("mav-cmd-do-parachute");

        const actionSelect = screen.getByLabelText("Action") as HTMLSelectElement;
        const optionLabels = within(actionSelect)
            .getAllByRole("option")
            .map((option) => option.textContent);

        expect(optionLabels).toEqual(["Disable", "Enable", "Release"]);
        expect(optionLabels).not.toContain("Climb");
        expect(optionLabels).not.toContain("Grab");
    });

    it("renders metadata units and disables unsupported waypoint fields", () => {
        const position = defaultGeoPoint3d(47.3769, 8.5417, 50);
        const { container } = renderMissionInspector(defaultCommand("Nav", "Waypoint", position));

        const holdUnit = container.querySelector('[data-command-field-unit="hold_time_s"]');
        expect(holdUnit?.textContent).toBe("s");

        const acceptRadiusInput = container.querySelector(
            '[data-command-field="acceptance_radius_m"] input',
        ) as HTMLInputElement | null;
        expect(acceptRadiusInput).toBeTruthy();
        expect(acceptRadiusInput?.disabled).toBe(true);
        expect(
            (container.querySelector('[data-command-field-note="acceptance_radius_m"]') as HTMLElement | null)?.textContent,
        ).toContain("WP_RADIUS_M");
    });

    it("hides metadata-hidden takeoff fields and still exposes altitude editing", () => {
        const position = defaultGeoPoint3d(47.3769, 8.5417, 25);
        renderMissionInspector(defaultCommand("Nav", "Takeoff", position));

        expect(screen.queryByText("Pitch")).toBeNull();
        expect(screen.queryByText(/^Latitude$/)).toBeNull();
        expect(screen.queryByText(/^Longitude$/)).toBeNull();
        expect(screen.queryByText("Coordinates")).toBeNull();

        expect(screen.getByText("Climb straight up to the specified altitude.")).toBeTruthy();
        expect(document.querySelector('[data-param-slot="altitude"]')).toBeTruthy();
    });
});
