import { describe, expect, it } from "vitest";

import {
  buildCatalogTargets,
  filterCatalogEntriesByBoardAndPlatform,
  filterCatalogTargetsToSupportedOfficialBootloaders,
  parseFirmwareManifestGz,
  parseFirmwareManifestJson,
  parseSupportedOfficialBootloaderTargets,
} from "./catalog";

describe("firmware catalog helpers", () => {
  it("parses manifest JSON, keeps only APJ entries, and builds targets", () => {
    const entries = parseFirmwareManifestJson(JSON.stringify({
      firmware: [
        {
          board_id: 140,
          platform: "CubeOrange",
          "mav-type": "Copter",
          "mav-firmware-version": "4.5.0",
          "mav-firmware-version-type": "OFFICIAL",
          format: "apj",
          url: "https://firmware.ardupilot.org/Copter/stable/CubeOrange/arducopter.apj",
          image_size: 123,
          latest: 1,
          "git-sha": "abc",
          brand_name: "Cube Orange",
          manufacturer: "Hex",
        },
        {
          board_id: 140,
          platform: "CubeOrange",
          "mav-type": "Plane",
          "mav-firmware-version": "4.6.0",
          "mav-firmware-version-type": "OFFICIAL",
          format: "apj",
          url: "https://firmware.ardupilot.org/Plane/stable/CubeOrange/arduplane.apj",
          image_size: 456,
          latest: 1,
          "git-sha": "def",
          brand_name: null,
          manufacturer: null,
        },
        {
          board_id: 140,
          platform: "CubeOrange",
          format: "hex",
          url: "https://firmware.ardupilot.org/ignored.hex",
        },
      ],
    }));

    expect(entries).toHaveLength(2);
    expect(filterCatalogEntriesByBoardAndPlatform(entries, 140, "CubeOrange")).toHaveLength(2);
    expect(buildCatalogTargets(entries)).toEqual([{
      board_id: 140,
      platform: "CubeOrange",
      brand_name: "Cube Orange",
      manufacturer: "Hex",
      vehicle_types: ["Copter", "Plane"],
      latest_version: "4.6.0",
    }]);
  });

  it("parses gzipped manifests with standard browser compression streams", async () => {
    const bytes = await gzipText(JSON.stringify({
      firmware: [{ board_id: 9, platform: "fmuv2", format: "apj", url: "https://firmware.ardupilot.org/fw.apj" }],
    }));

    await expect(parseFirmwareManifestGz(bytes)).resolves.toEqual([
      expect.objectContaining({ board_id: 9, platform: "fmuv2", format: "apj" }),
    ]);
  });

  it("parses and applies official bootloader target listings", () => {
    const supported = parseSupportedOfficialBootloaderTargets(`
      <a href="CubeOrange_bl.bin">CubeOrange_bl.bin</a>
      <a href='/Tools/Bootloaders/fmuv3_bl.bin'>fmuv3_bl.bin</a>
      <a href="notes.txt">notes.txt</a>
    `);

    expect(supported).toEqual(new Set(["CubeOrange", "fmuv3"]));
    expect(filterCatalogTargetsToSupportedOfficialBootloaders([
      { board_id: 140, platform: "CubeOrange", brand_name: null, manufacturer: null, vehicle_types: [], latest_version: null },
      { board_id: 9, platform: "NoBootloader", brand_name: null, manufacturer: null, vehicle_types: [], latest_version: null },
    ], supported)).toEqual([
      expect.objectContaining({ platform: "CubeOrange" }),
    ]);
  });
});

async function gzipText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
