// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { parseKml, parseKmz } from "./mission-kml-io";

function wrapKml(body: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    ${body}
  </Document>
</kml>`;
}

function kmzBytes(base64: string): Uint8Array {
    return Uint8Array.from(Buffer.from(base64, "base64"));
}

describe("mission-kml-io: parseKml", () => {
    it("parses Polygon placemarks into inclusion fence regions, strips duplicate closing vertices, and preserves lon/lat ordering", () => {
        const input = wrapKml(`
          <Placemark>
            <name>Test Fence</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    8.5000,47.3000,0
                    8.6000,47.3000,0
                    8.6000,47.4000,0
                    8.5000,47.3000,0
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        `);

        const result = parseKml(input);

        expect(result.missionItems).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.fenceRegions).toEqual([
            {
                inclusion_polygon: {
                    inclusion_group: 0,
                    vertices: [
                        { latitude_deg: 47.3, longitude_deg: 8.5 },
                        { latitude_deg: 47.3, longitude_deg: 8.6 },
                        { latitude_deg: 47.4, longitude_deg: 8.6 },
                    ],
                },
            },
        ]);
    });

    it("parses LineString placemarks into waypoint mission items with configurable default relative altitude", () => {
        const input = wrapKml(`
          <Placemark>
            <name>Path</name>
            <LineString>
              <coordinates>
                8.545594,47.397742,10 8.550000,47.400000,20 8.560000,47.410000,30
              </coordinates>
            </LineString>
          </Placemark>
        `);

        const result = parseKml(input, { defaultRelativeAltitudeM: 75 });

        expect(result.fenceRegions).toEqual([]);
        expect(result.warnings).toEqual([]);
        expect(result.missionItems).toHaveLength(3);
        expect(result.missionItems.map((item) => item.current)).toEqual([true, false, false]);
        expect(result.missionItems.map((item) => item.autocontinue)).toEqual([true, true, true]);
        expect(result.missionItems[0]).toEqual({
            command: {
                Nav: {
                    Waypoint: {
                        position: {
                            RelHome: {
                                latitude_deg: 47.397742,
                                longitude_deg: 8.545594,
                                relative_alt_m: 75,
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
        });
        expect(result.missionItems[2].command).toEqual({
            Nav: {
                Waypoint: {
                    position: {
                        RelHome: {
                            latitude_deg: 47.41,
                            longitude_deg: 8.56,
                            relative_alt_m: 75,
                        },
                    },
                    hold_time_s: 0,
                    acceptance_radius_m: 0,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        });
    });

    it("parses mixed Polygon and LineString placemarks from nested Document and Folder containers", () => {
        const input = `<?xml version="1.0" encoding="UTF-8"?>
        <kml xmlns="http://www.opengis.net/kml/2.2">
          <Document>
            <Folder>
              <Placemark>
                <name>Boundary</name>
                <Polygon>
                  <outerBoundaryIs>
                    <LinearRing>
                      <coordinates>8.1,47.1 8.2,47.1 8.2,47.2</coordinates>
                    </LinearRing>
                  </outerBoundaryIs>
                </Polygon>
              </Placemark>
            </Folder>
            <Document>
              <Folder>
                <Placemark>
                  <name>Survey Path</name>
                  <LineString>
                    <coordinates>8.3,47.3 8.4,47.4</coordinates>
                  </LineString>
                </Placemark>
              </Folder>
            </Document>
          </Document>
        </kml>`;

        const result = parseKml(input);

        expect(result.fenceRegions).toHaveLength(1);
        expect(result.missionItems).toHaveLength(2);
        expect(result.missionItems[0].current).toBe(true);
        expect(result.missionItems[1].current).toBe(false);
        expect(result.fenceRegions[0]).toEqual({
            inclusion_polygon: {
                inclusion_group: 0,
                vertices: [
                    { latitude_deg: 47.1, longitude_deg: 8.1 },
                    { latitude_deg: 47.1, longitude_deg: 8.2 },
                    { latitude_deg: 47.2, longitude_deg: 8.2 },
                ],
            },
        });
    });

    it("parses MultiGeometry containers and warns on unsupported Point geometry", () => {
        const input = wrapKml(`
          <Placemark>
            <name>Mixed Geometry</name>
            <MultiGeometry>
              <Polygon>
                <outerBoundaryIs>
                  <LinearRing>
                    <coordinates>8.0,47.0 8.1,47.0 8.1,47.1</coordinates>
                  </LinearRing>
                </outerBoundaryIs>
              </Polygon>
              <LineString>
                <coordinates>8.2,47.2 8.3,47.3</coordinates>
              </LineString>
              <Point>
                <coordinates>8.4,47.4,0</coordinates>
              </Point>
            </MultiGeometry>
          </Placemark>
        `);

        const result = parseKml(input);

        expect(result.fenceRegions).toHaveLength(1);
        expect(result.missionItems).toHaveLength(2);
        expect(result.warnings).toEqual([
            'Placemark "Mixed Geometry" contains unsupported Point geometry and it was ignored.',
        ]);
    });

    it("gracefully handles malformed XML", () => {
        const result = parseKml("<kml><Document><Placemark>");

        expect(result).toEqual({
            fenceRegions: [],
            missionItems: [],
            warnings: ["KML XML could not be parsed; no mission or fence data was imported."],
        });
    });

    it("warns and skips empty coordinates and Polygon inner holes", () => {
        const input = wrapKml(`
          <Placemark>
            <name>Broken Boundary</name>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates></coordinates>
                </LinearRing>
              </outerBoundaryIs>
              <innerBoundaryIs>
                <LinearRing>
                  <coordinates>8.0,47.0 8.01,47.0 8.01,47.01</coordinates>
                </LinearRing>
              </innerBoundaryIs>
            </Polygon>
          </Placemark>
        `);

        const result = parseKml(input);

        expect(result.fenceRegions).toEqual([]);
        expect(result.missionItems).toEqual([]);
        expect(result.warnings).toEqual([
            'Placemark "Broken Boundary" contains Polygon innerBoundaryIs holes; IronWing ignores interior holes during KML import.',
            'Placemark "Broken Boundary" Polygon had empty coordinates and was skipped.',
        ]);
    });
});

describe("mission-kml-io: parseKmz", () => {
    it("unzips KMZ archives and parses the first embedded KML file", () => {
        const archive = kmzBytes(
            "UEsDBBQAAAAIAO+df1yyBgousQAAAA8BAAAHAAAAZG9jLmttbF2Pyw6CQAxF93zFZNY6FeKDmGHYGFcujI8PINggAToEBvHzLRjiY3fv7Ul7q+NnVYoHNm1uKZK+WkiBlNpbTlkkr5f9PJSx8XTBFJPURvLuXL0F6Pte2Ropy1tF6IAJCFQgjSeE3tm0q5DcYNgeyyTFKmmKt+eEkgrNyXYONYx6GhxywrNr+PwUcZha23CjxGFrQrX2Z8uNWvmCZTDKQMM3Mu2C/2Uafppo+PTUwwPmBVBLAwQUAAAACADvnX9cTkHU1gkAAAAHAAAAEAAAAG5vdGVzL3JlYWRtZS50eHTLTM/LL0pNAQBQSwECFAAUAAAACADvnX9csgYKLrEAAAAPAQAABwAAAAAAAAAAAAAAAAAAAAAAZG9jLmttbFBLAQIUABQAAAAIAO+df1xOQdTWCQAAAAcAAAAQAAAAAAAAAAAAAAAAANYAAABub3Rlcy9yZWFkbWUudHh0UEsFBgAAAAACAAIAcwAAAA0BAAAAAA==",
        );

        const result = parseKmz(archive);

        expect(result.warnings).toEqual([]);
        expect(result.fenceRegions).toEqual([]);
        expect(result.missionItems).toHaveLength(2);
        expect(result.missionItems[0].command).toEqual({
            Nav: {
                Waypoint: {
                    position: {
                        RelHome: {
                            latitude_deg: 47.51,
                            longitude_deg: 8.61,
                            relative_alt_m: 50,
                        },
                    },
                    hold_time_s: 0,
                    acceptance_radius_m: 0,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        });
    });

    it("returns an empty result when a KMZ contains no KML file", () => {
        const archive = kmzBytes(
            "UEsDBBQAAAAIAPOdf1y9tKeJEQAAAA8AAAAHAAAAZG9jLnR4dMvLV8jNLC7OzM9TyEgtSgUAUEsBAhQAFAAAAAgA851/XL20p4kRAAAADwAAAAcAAAAAAAAAAAAAAAAAAAAAAGRvYy50eHRQSwUGAAAAAAEAAQA1AAAANgAAAAAA",
        );

        const result = parseKmz(archive);

        expect(result).toEqual({
            fenceRegions: [],
            missionItems: [],
            warnings: ["KMZ archive contained no .kml file; nothing was imported."],
        });
    });
});
