// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import UPlotChart from "./UPlotChart.svelte";

describe("UPlotChart", () => {
  afterEach(() => {
    cleanup();
  });

  it("sizes the reusable chart shell from the height prop", () => {
    render(UPlotChart, {
      props: {
        options: {
          scales: { x: { time: false } },
          series: [{}, { label: "Series", stroke: "#60a5fa", width: 2 }],
        },
        data: [[1, 2, 3], [4, 5, 6]],
        height: 120,
        testId: "uplot-chart",
      },
    });

    const chart = screen.getByTestId("uplot-chart");
    expect(chart.style.minHeight).toBe("120px");
  });
});
