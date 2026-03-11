// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { vehicleTypeToSlug, parseMetadataXml } from "./param-metadata";

describe("vehicleTypeToSlug", () => {
  it("maps copter variants to ArduCopter", () => {
    expect(vehicleTypeToSlug("quadrotor")).toBe("ArduCopter");
    expect(vehicleTypeToSlug("hexarotor")).toBe("ArduCopter");
    expect(vehicleTypeToSlug("octorotor")).toBe("ArduCopter");
    expect(vehicleTypeToSlug("tricopter")).toBe("ArduCopter");
    expect(vehicleTypeToSlug("helicopter")).toBe("ArduCopter");
    expect(vehicleTypeToSlug("coaxial")).toBe("ArduCopter");
  });

  it("maps plane to ArduPlane", () => {
    expect(vehicleTypeToSlug("fixed_wing")).toBe("ArduPlane");
  });

  it("maps rover to Rover", () => {
    expect(vehicleTypeToSlug("ground_rover")).toBe("Rover");
  });

  it("returns null for unknown vehicle types", () => {
    expect(vehicleTypeToSlug("submarine")).toBeNull();
    expect(vehicleTypeToSlug("blimp")).toBeNull();
    expect(vehicleTypeToSlug("")).toBeNull();
  });
});

describe("parseMetadataXml", () => {
  it("parses a minimal param element", () => {
    const xml = `
      <paramfile>
        <param name="PILOT_THR_FILT" humanName="Throttle Filter" documentation="Controls throttle filtering">
        </param>
      </paramfile>`;
    const map = parseMetadataXml(xml);

    expect(map.size).toBe(1);
    const meta = map.get("PILOT_THR_FILT")!;
    expect(meta.humanName).toBe("Throttle Filter");
    expect(meta.description).toBe("Controls throttle filtering");
  });

  it("strips vehicle prefix from param name", () => {
    const xml = `
      <paramfile>
        <param name="ArduCopter:PILOT_THR_FILT" humanName="Throttle Filter" documentation="desc">
        </param>
      </paramfile>`;
    const map = parseMetadataXml(xml);

    expect(map.has("PILOT_THR_FILT")).toBe(true);
    expect(map.has("ArduCopter:PILOT_THR_FILT")).toBe(false);
  });

  it("parses Range field", () => {
    const xml = `
      <paramfile>
        <param name="THR_MIN" humanName="Min Throttle" documentation="desc">
          <field name="Range">0 1000</field>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("THR_MIN")!;

    expect(meta.range).toEqual({ min: 0, max: 1000 });
  });

  it("parses Increment field", () => {
    const xml = `
      <paramfile>
        <param name="THR_MIN" humanName="Min" documentation="desc">
          <field name="Increment">0.1</field>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("THR_MIN")!;

    expect(meta.increment).toBe(0.1);
  });

  it("parses Units and UnitText fields", () => {
    const xml = `
      <paramfile>
        <param name="ALT_HOLD" humanName="Alt Hold" documentation="desc">
          <field name="Units">m</field>
          <field name="UnitText">meters</field>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("ALT_HOLD")!;

    expect(meta.units).toBe("m");
    expect(meta.unitText).toBe("meters");
  });

  it("parses RebootRequired and ReadOnly fields", () => {
    const xml = `
      <paramfile>
        <param name="CAN_D1_PROTOCOL" humanName="CAN" documentation="desc">
          <field name="RebootRequired">True</field>
          <field name="ReadOnly">True</field>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("CAN_D1_PROTOCOL")!;

    expect(meta.rebootRequired).toBe(true);
    expect(meta.readOnly).toBe(true);
  });

  it("parses values enum", () => {
    const xml = `
      <paramfile>
        <param name="FLTMODE1" humanName="Mode 1" documentation="desc">
          <values>
            <value code="0">Stabilize</value>
            <value code="5">Loiter</value>
          </values>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("FLTMODE1")!;

    expect(meta.values).toEqual([
      { code: 0, label: "Stabilize" },
      { code: 5, label: "Loiter" },
    ]);
  });

  it("parses bitmask entries", () => {
    const xml = `
      <paramfile>
        <param name="ARMING_CHECK" humanName="Arming Check" documentation="desc">
          <bitmask>
            <bit code="0">All</bit>
            <bit code="1">Barometer</bit>
          </bitmask>
        </param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("ARMING_CHECK")!;

    expect(meta.bitmask).toEqual([
      { bit: 0, label: "All" },
      { bit: 1, label: "Barometer" },
    ]);
  });

  it("parses userLevel attribute", () => {
    const xml = `
      <paramfile>
        <param name="P1" humanName="P1" documentation="d" user="Standard"></param>
        <param name="P2" humanName="P2" documentation="d" user="Advanced"></param>
        <param name="P3" humanName="P3" documentation="d" user="Other"></param>
      </paramfile>`;
    const map = parseMetadataXml(xml);

    expect(map.get("P1")!.userLevel).toBe("Standard");
    expect(map.get("P2")!.userLevel).toBe("Advanced");
    expect(map.get("P3")!.userLevel).toBeUndefined();
  });

  it("first occurrence wins for duplicate param names", () => {
    const xml = `
      <paramfile>
        <param name="P1" humanName="First" documentation="first"></param>
        <param name="P1" humanName="Second" documentation="second"></param>
      </paramfile>`;
    const meta = parseMetadataXml(xml).get("P1")!;

    expect(meta.humanName).toBe("First");
  });

  it("skips params with empty name", () => {
    const xml = `
      <paramfile>
        <param name="" humanName="Empty" documentation="d"></param>
        <param name="VALID" humanName="Valid" documentation="d"></param>
      </paramfile>`;
    const map = parseMetadataXml(xml);

    expect(map.size).toBe(1);
    expect(map.has("VALID")).toBe(true);
  });
});
