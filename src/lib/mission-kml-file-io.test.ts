// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  createMissionKmlFileIo,
  type MissionKmlFileIoDependencies,
} from "./mission-kml-file-io";

function createIo(overrides: Partial<MissionKmlFileIoDependencies> = {}) {
  const openFile = vi.fn<NonNullable<MissionKmlFileIoDependencies["openFile"]>>();

  return {
    openFile,
    io: createMissionKmlFileIo({
      openFile,
      ...overrides,
    }),
  };
}

function wrapKml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${body}
  </Document>
</kml>`;
}

describe("createMissionKmlFileIo", () => {
  it("returns cancelled when the browser picker is dismissed", async () => {
    const { io, openFile } = createIo();
    openFile.mockResolvedValueOnce(null);

    await expect(io.importFromPicker()).resolves.toEqual({ status: "cancelled" });
  });

  it("imports mixed KML mission and fence geometry with parser warnings preserved", async () => {
    const { io, openFile } = createIo();
    openFile.mockResolvedValueOnce({
      name: "continuity.kml",
      source: "kml",
      text: wrapKml(`
        <Placemark>
          <name>Boundary</name>
          <Polygon>
            <outerBoundaryIs>
              <LinearRing>
                <coordinates>8.5,47.3 8.6,47.3 8.6,47.4</coordinates>
              </LinearRing>
            </outerBoundaryIs>
          </Polygon>
        </Placemark>
        <Placemark>
          <name>Route</name>
          <LineString>
            <coordinates>8.545594,47.397742 8.550000,47.400000</coordinates>
          </LineString>
        </Placemark>
        <Placemark>
          <name>Ignored pin</name>
          <Point>
            <coordinates>8.7,47.5,0</coordinates>
          </Point>
        </Placemark>
      `),
    });

    const result = await io.importFromPicker();

    expect(result).toMatchObject({
      status: "success",
      source: "kml",
      fileName: "continuity.kml",
      missionItemCount: 2,
      fenceRegionCount: 1,
      warningCount: 1,
    });

    if (result.status !== "success") {
      throw new Error("expected a successful KML import");
    }

    expect(result.warnings).toEqual([
      'Placemark "Ignored pin" contains unsupported Point geometry and it was ignored.',
    ]);
    expect(result.data.mission.items).toHaveLength(2);
    expect(result.data.fence.regions).toHaveLength(1);
  });

  it("imports KMZ bytes through the binary seam", async () => {
    const { io, openFile } = createIo({
      parseKmzFile: vi.fn(() => ({
        missionItems: [
          {
            command: {
              Nav: {
                Waypoint: {
                  position: {
                    RelHome: {
                      latitude_deg: 47.397742,
                      longitude_deg: 8.545594,
                      relative_alt_m: 50,
                    },
                  },
                  hold_time_s: 0,
                  acceptance_radius_m: 0,
                  pass_radius_m: 0,
                  yaw_deg: 0,
                },
              },
            },
            current: true,
            autocontinue: true,
          },
        ],
        fenceRegions: [],
        warnings: ["Imported KMZ route with 1 waypoint."],
      })),
    });
    openFile.mockResolvedValueOnce({
      name: "continuity.kmz",
      source: "kmz",
      bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    });

    const result = await io.importFromPicker();

    expect(result).toMatchObject({
      status: "success",
      source: "kmz",
      fileName: "continuity.kmz",
      missionItemCount: 1,
      fenceRegionCount: 0,
      warningCount: 1,
    });
  });

  it("rejects unsupported-geometry imports before any partial replacement can happen", async () => {
    const { io, openFile } = createIo();
    openFile.mockResolvedValueOnce({
      name: "unsupported.kml",
      source: "kml",
      text: wrapKml(`
        <Placemark>
          <name>Only pin</name>
          <Point>
            <coordinates>8.4,47.4,0</coordinates>
          </Point>
        </Placemark>
      `),
    });

    await expect(io.importFromPicker()).rejects.toThrow(/did not contain supported mission or fence geometry/i);
  });

  it("rejects unreadable KMZ archives before any import review is opened", async () => {
    const { io, openFile } = createIo({
      parseKmzFile: vi.fn(() => ({
        missionItems: [],
        fenceRegions: [],
        warnings: ["KMZ archive could not be read; no mission or fence data was imported."],
      })),
    });
    openFile.mockResolvedValueOnce({
      name: "broken.kmz",
      source: "kmz",
      bytes: new Uint8Array([0x00, 0x01, 0x02]),
    });

    await expect(io.importFromPicker()).rejects.toThrow(/kmz archive could not be read/i);
  });
});
