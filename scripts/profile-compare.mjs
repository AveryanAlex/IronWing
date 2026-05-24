import { forwardedArgs } from "./workflow/paths.mjs";
import {
  DEFAULT_PROFILE_HOT_FUNCTIONS,
  aggregateProfileByFunction,
  compareProfileFunctions,
  createHotFunctionPredicate,
  loadCpuProfile,
  parseArgs,
  profileDurationMs,
} from "./workflow/cpu-profile.mjs";

const HELP = `Usage: node scripts/profile-compare.mjs --before <profile> --after <profile> [options]

Compare two Chromium CPU profiles with a focus on MapLibre/HUD hotspots.

Options:
  --before <path>           Baseline profile path.
  --after <path>            Candidate profile path.
  --functions <csv>         Override hotspot function list.
  --limit <n>               Rows to show in top sections. Default: 15
  --json                    Print JSON instead of tables.
  --help                    Show this message.
`;

const { options } = parseArgs(forwardedArgs());
if (options.help) {
  console.log(HELP);
  process.exit(0);
}

if (!options.before || !options.after) {
  console.error(HELP);
  process.exit(1);
}

const functions = options.functions
  ? String(options.functions).split(",").map((value) => value.trim()).filter(Boolean)
  : DEFAULT_PROFILE_HOT_FUNCTIONS;
const limit = parseIntOption(options.limit, 15, "limit");

const beforeProfile = loadCpuProfile(options.before);
const afterProfile = loadCpuProfile(options.after);
const predicate = createHotFunctionPredicate(functions);
const beforeRows = aggregateProfileByFunction(beforeProfile, predicate);
const afterRows = aggregateProfileByFunction(afterProfile, predicate);
const compareRows = compareProfileFunctions(beforeRows, afterRows, functions);

const summary = {
  before: {
    sampleCount: beforeProfile.samples?.length ?? 0,
    durationMs: profileDurationMs(beforeProfile),
    top: beforeRows.slice(0, limit),
  },
  after: {
    sampleCount: afterProfile.samples?.length ?? 0,
    durationMs: profileDurationMs(afterProfile),
    top: afterRows.slice(0, limit),
  },
  compare: compareRows,
};

if (options.json) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

console.log("Before profile:", options.before);
console.log(`  samples: ${summary.before.sampleCount}`);
console.log(`  durationMs: ${summary.before.durationMs.toFixed(2)}`);
console.table(summary.before.top.map(toTableRow));

console.log("After profile:", options.after);
console.log(`  samples: ${summary.after.sampleCount}`);
console.log(`  durationMs: ${summary.after.durationMs.toFixed(2)}`);
console.table(summary.after.top.map(toTableRow));

console.log("Selected hotspot deltas:");
console.table(compareRows.map((row) => ({
  fn: row.fn,
  beforePct: round(row.beforeTotalPct),
  afterPct: round(row.afterTotalPct),
  deltaPct: round(row.deltaTotalPct),
  beforeCount: row.beforeTotalCount,
  afterCount: row.afterTotalCount,
})));

function parseIntOption(value, fallback, name) {
  if (value == null) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected --${name} to be a positive integer, got: ${value}`);
  }

  return parsed;
}

function round(value) {
  return Number(value.toFixed(4));
}

function toTableRow(row) {
  return {
    fn: row.fn,
    totalPct: round(row.totalPct),
    selfPct: round(row.selfPct),
    totalCount: row.totalCount,
    selfCount: row.selfCount,
  };
}
