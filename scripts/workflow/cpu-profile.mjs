import fs from "node:fs";
import path from "node:path";

export const DEFAULT_PROFILE_HOT_FUNCTIONS = [
  "scaledTo",
  "getSourceTile",
  "getTerrainData",
  "getTileById",
  "receive",
  "updateBucketOpacities",
  "placeCollisionCircles",
  "_render",
  "_updateSources",
  "recalculate",
  "jumpTo",
  "renderCameraFrame",
  "renderCamera",
  "applySvsAircraftCamera",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1);
      options[key] = value;
      continue;
    }

    const next = argv[index + 1];
    if (next != null && !next.startsWith("--")) {
      options[withoutPrefix] = next;
      index += 1;
      continue;
    }

    options[withoutPrefix] = true;
  }

  return { options, positionals };
}

export function resolvePath(filePath, cwd = process.cwd()) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

export function loadCpuProfile(filePath) {
  const resolved = resolvePath(filePath);
  return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

export function profileDurationMs(profile) {
  return Math.max(0, (profile.endTime - profile.startTime) / 1000);
}

export function aggregateProfileByFunction(profile, predicate = () => true) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  const total = new Map();

  for (const id of profile.samples ?? []) {
    self.set(id, (self.get(id) ?? 0) + 1);
    let currentId = id;
    const visited = new Set();
    while (currentId != null) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      total.set(currentId, (total.get(currentId) ?? 0) + 1);
      currentId = nodes.get(currentId)?.parent;
    }
  }

  const merged = new Map();
  for (const [id, totalCount] of total.entries()) {
    const node = nodes.get(id);
    if (!node) continue;
    const fn = node.callFrame.functionName || "(anonymous)";
    const url = node.callFrame.url || "";
    if (!predicate(fn, url)) continue;

    const prev = merged.get(fn) ?? {
      fn,
      selfCount: 0,
      totalCount: 0,
      selfPct: 0,
      totalPct: 0,
      urls: new Set(),
    };

    const selfCount = self.get(id) ?? 0;
    prev.selfCount += selfCount;
    prev.totalCount += totalCount;
    prev.selfPct += (selfCount / (profile.samples?.length || 1)) * 100;
    prev.totalPct += (totalCount / (profile.samples?.length || 1)) * 100;
    if (url) prev.urls.add(url);
    merged.set(fn, prev);
  }

  return [...merged.values()]
    .map((row) => ({
      ...row,
      urls: [...row.urls],
    }))
    .sort((left, right) => right.totalCount - left.totalCount);
}

export function compareProfileFunctions(beforeRows, afterRows, functions) {
  return functions
    .map((fn) => {
      const before = beforeRows.find((row) => row.fn === fn) ?? emptyRow(fn);
      const after = afterRows.find((row) => row.fn === fn) ?? emptyRow(fn);
      return {
        fn,
        beforeTotalPct: before.totalPct,
        afterTotalPct: after.totalPct,
        deltaTotalPct: after.totalPct - before.totalPct,
        beforeTotalCount: before.totalCount,
        afterTotalCount: after.totalCount,
        beforeSelfPct: before.selfPct,
        afterSelfPct: after.selfPct,
      };
    })
    .filter((row) => row.beforeTotalCount > 0 || row.afterTotalCount > 0);
}

export function createHotFunctionPredicate(functions = DEFAULT_PROFILE_HOT_FUNCTIONS) {
  const expected = new Set(functions);
  return (fn, url) => expected.has(fn) || /maplibre-gl/.test(url) || /SvsMap|svs-camera/.test(url);
}

export function createSpeedscopeUrl(profileUrl, title = "CPU profile") {
  const hash = new URLSearchParams({
    profileURL: profileUrl,
    title,
  });
  return `https://www.speedscope.app/#${hash.toString()}`;
}

function emptyRow(fn) {
  return {
    fn,
    selfCount: 0,
    totalCount: 0,
    selfPct: 0,
    totalPct: 0,
    urls: [],
  };
}
