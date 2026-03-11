import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(__dirname, "PidTuningSection.tsx"), "utf-8");

describe("PidTuningSection shared shell chrome", () => {
  it("imports SetupSectionIntro from shared module", () => {
    expect(src).toContain('import { SetupSectionIntro } from "../shared/SetupSectionIntro"');
  });

  it("imports SectionCardHeader from shared module", () => {
    expect(src).toContain('import { SectionCardHeader } from "../shared/SectionCardHeader"');
  });

  it("imports resolveDocsUrl from ardupilot-docs registry", () => {
    expect(src).toContain('import { resolveDocsUrl } from "../../../data/ardupilot-docs"');
  });

  it("renders SetupSectionIntro with PID Tuning title", () => {
    expect(src).toContain("<SetupSectionIntro");
    expect(src).toContain('title="PID Tuning"');
  });

  it("resolves tuning docs from the central registry", () => {
    expect(src).toContain('resolveDocsUrl("tuning")');
  });

  it("passes tuning docs URL to the intro", () => {
    expect(src).toContain("docsUrl={tuningDocsUrl}");
  });

  it("uses SectionCardHeader for card-level headers", () => {
    const cardHeaders = src.match(/<SectionCardHeader/g);
    expect(cardHeaders).not.toBeNull();
    expect(cardHeaders!.length).toBeGreaterThanOrEqual(3);
  });

  it("does not use hardcoded docs URLs", () => {
    expect(src).not.toMatch(/https?:\/\/ardupilot\.org/);
  });
});

describe("PidTuningSection preserves copter/plane panels", () => {
  it("renders Rate PIDs card for copter", () => {
    expect(src).toContain("Rate PIDs");
    expect(src).toContain("RateAxisCard");
  });

  it("renders Angle Controller card for copter", () => {
    expect(src).toContain("Angle Controller");
  });

  it("renders Position Controller card for copter", () => {
    expect(src).toContain("Position Controller");
  });

  it("renders Servo Tuning card for plane", () => {
    expect(src).toContain("Servo Tuning");
  });

  it("renders Speed Configuration card for plane", () => {
    expect(src).toContain("Speed Configuration");
  });

  it("renders Filters card for both vehicle types", () => {
    expect(src).toContain("Filters");
    expect(src).toContain("INS_GYRO_FILTER");
    expect(src).toContain("INS_HNTCH_ENABLE");
  });

  it("shows no-vehicle fallback when vehicleState is null", () => {
    expect(src).toContain("Connect to a vehicle to see PID tuning parameters");
  });
});
