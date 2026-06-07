import { fetchParamMetadataXml } from "./lib/param-metadata-cache";

export type ParamMeta = {
  humanName: string;
  description: string;
  range?: { min: number; max: number };
  increment?: number;
  units?: string;
  unitText?: string;
  values?: { code: number; label: string }[];
  bitmask?: { bit: number; label: string }[];
  rebootRequired?: boolean;
  readOnly?: boolean;
  userLevel?: "Standard" | "Advanced";
};

export type ParamMetadataMap = Map<string, ParamMeta>;

const SLUG_MAP: Record<string, string> = {
  quadrotor: "ArduCopter",
  hexarotor: "ArduCopter",
  octorotor: "ArduCopter",
  tricopter: "ArduCopter",
  helicopter: "Heli",
  coaxial: "ArduCopter",
  fixed_wing: "ArduPlane",
  vtol: "ArduPlane",
  ground_rover: "Rover",
  submarine: "ArduSub",
  blimp: "Blimp",
  antenna_tracker: "AntennaTracker",
};

export function vehicleTypeToSlug(vehicleType: string): string | null {
  return SLUG_MAP[vehicleType] ?? null;
}

export function normalizeFirmwareVersion(firmwareVersion: string | null | undefined): string | null {
  const trimmed = firmwareVersion?.trim();
  return trimmed && /^\d+\.\d+\.\d+$/.test(trimmed) ? trimmed : null;
}

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readMetadataText(el: Element, fields: ReadonlyMap<string, string>, name: string): string | null {
  return optionalText(el.getAttribute(name)) ?? fields.get(name) ?? null;
}

function parseRange(value: string | null): { min: number; max: number } | undefined {
  const [minText, maxText] = value?.split(/\s+/) ?? [];
  const min = Number(minText);
  const max = Number(maxText);
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
  return value ? value.toLowerCase() === "true" : undefined;
}

function parseTextOptions(value: string | null): { code: number; label: string }[] | undefined {
  if (!value) return undefined;

  const options = value.split(",").flatMap((entry) => {
    const separator = entry.indexOf(":");
    const codeText = entry.slice(0, separator).trim();
    const label = entry.slice(separator + 1).trim();
    const code = Number(codeText);
    return separator > 0 && codeText && Number.isFinite(code) && label ? [{ code, label }] : [];
  });
  return options.length > 0 ? options : undefined;
}

function parseTextBitmask(value: string | null): { bit: number; label: string }[] | undefined {
  const bitmask = parseTextOptions(value)?.flatMap(({ code, label }) => Number.isInteger(code) ? [{ bit: code, label }] : []);
  return bitmask && bitmask.length > 0 ? bitmask : undefined;
}

export function parseMetadataXml(xml: string): ParamMetadataMap {
  const map: ParamMetadataMap = new Map();
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");

  const params = doc.querySelectorAll("param");
  for (const el of params) {
    const rawName = el.getAttribute("name") ?? "";
    // Strip vehicle prefix (e.g. "ArduCopter:PILOT_THR_FILT" -> "PILOT_THR_FILT")
    const name = rawName.includes(":") ? rawName.split(":")[1] : rawName;
    if (!name) continue;

    const fields = new Map<string, string>();
    for (const field of el.querySelectorAll("field")) {
      const fieldName = field.getAttribute("name");
      const text = optionalText(field.textContent);
      if (fieldName && text && !fields.has(fieldName)) fields.set(fieldName, text);
    }

    const user = readMetadataText(el, fields, "user") ?? readMetadataText(el, fields, "User");
    const meta: ParamMeta = {
      humanName: readMetadataText(el, fields, "humanName") ?? "",
      description: readMetadataText(el, fields, "documentation") ?? "",
    };
    if (user === "Standard" || user === "Advanced") {
      meta.userLevel = user;
    }

    const range = parseRange(readMetadataText(el, fields, "Range"));
    const increment = parseNumber(readMetadataText(el, fields, "Increment"));
    const units = readMetadataText(el, fields, "Units");
    const unitText = readMetadataText(el, fields, "UnitText");
    const rebootRequired = parseBoolean(readMetadataText(el, fields, "RebootRequired"));
    const readOnly = parseBoolean(readMetadataText(el, fields, "ReadOnly"));
    if (range) meta.range = range;
    if (increment !== undefined) meta.increment = increment;
    if (units) meta.units = units;
    if (unitText) meta.unitText = unitText;
    if (rebootRequired !== undefined) meta.rebootRequired = rebootRequired;
    if (readOnly !== undefined) meta.readOnly = readOnly;

    // Parse <values> -> <value code="N">Label</value>
    const valueEls = el.querySelectorAll("values > value");
    if (valueEls.length > 0) {
      meta.values = [];
      for (const v of valueEls) {
        const codeText = v.getAttribute("code")?.trim() ?? "";
        const code = Number(codeText);
        const label = v.textContent?.trim() ?? "";
        if (codeText && Number.isFinite(code) && label) {
          meta.values.push({ code, label });
        }
      }
      if (meta.values.length === 0) delete meta.values;
    } else {
      const values = parseTextOptions(readMetadataText(el, fields, "Values"));
      if (values) meta.values = values;
    }

    // Parse <bitmask> -> <bit code="N">Label</bit>
    const bitEls = el.querySelectorAll("bitmask > bit");
    if (bitEls.length > 0) {
      meta.bitmask = [];
      for (const b of bitEls) {
        const bitText = b.getAttribute("code")?.trim() ?? "";
        const bit = Number(bitText);
        const label = b.textContent?.trim() ?? "";
        if (bitText && Number.isInteger(bit) && label) {
          meta.bitmask.push({ bit, label });
        }
      }
      if (meta.bitmask.length === 0) delete meta.bitmask;
    } else {
      const bitmask = parseTextBitmask(readMetadataText(el, fields, "Bitmask"));
      if (bitmask) meta.bitmask = bitmask;
    }

    // Don't overwrite — first occurrence wins (vehicle params over library params)
    if (!map.has(name)) {
      map.set(name, meta);
    }
  }

  return map;
}

export async function fetchParamMetadata(
  vehicleType: string,
  firmwareVersion?: string | null,
): Promise<ParamMetadataMap | null> {
  const slug = vehicleTypeToSlug(vehicleType);
  if (!slug) return null;

  const xml = await fetchParamMetadataXml(slug, normalizeFirmwareVersion(firmwareVersion));
  return xml ? parseMetadataXml(xml) : null;
}
