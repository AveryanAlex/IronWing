// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { CircleHelp } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { SetupSectionIntro } from "./SetupSectionIntro";

afterEach(() => {
  cleanup();
});

describe("SetupSectionIntro", () => {
  it("renders its docs link with the inline variant styling", () => {
    render(
      <SetupSectionIntro
        icon={CircleHelp}
        title="Radio"
        description="Set up your transmitter inputs."
        docsUrl="https://ardupilot.org/copter/docs/common-radio-control-calibration.html"
        docsLabel="Read the ArduPilot guide"
      />,
    );

    const link = screen.getByRole("link", {
      name: /read the ardupilot guide/i,
    });

    expect(link.getAttribute("href")).toBe(
      "https://ardupilot.org/copter/docs/common-radio-control-calibration.html",
    );
    expect(link.className).toContain("text-accent");
    expect(link.className).not.toContain("text-text-muted");
  });
});
