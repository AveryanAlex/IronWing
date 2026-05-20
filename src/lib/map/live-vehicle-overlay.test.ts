// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createLiveVehicleOverlay } from "./live-vehicle-overlay";

describe("createLiveVehicleOverlay", () => {
  it("attaches once, animates later positions, and unwraps heading across north", () => {
    const marker = {
      addTo: vi.fn().mockReturnThis(),
      getElement: vi.fn(() => document.createElement("div")),
      remove: vi.fn(),
      setLngLat: vi.fn().mockReturnThis(),
    };
    const overlay = createLiveVehicleOverlay((element) => {
      marker.getElement.mockReturnValue(element as HTMLDivElement);
      return marker as never;
    });
    const map = {} as never;

    overlay.sync({ map, lngLat: [8, 47], headingDeg: 359 });
    expect(marker.setLngLat).toHaveBeenCalledWith([8, 47]);
    expect(marker.addTo).toHaveBeenCalledTimes(1);
    expect(marker.getElement().querySelector("svg")?.style.transform).toBe("rotate(359deg)");

    marker.setLngLat.mockClear();
    overlay.sync({ map, lngLat: [9, 48], headingDeg: 0 });

    expect(marker.addTo).toHaveBeenCalledTimes(1);
    expect(marker.setLngLat).not.toHaveBeenCalledWith([9, 48]);
    expect(marker.getElement().querySelector("svg")?.style.transform).toBe("rotate(360deg)");
  });
});
