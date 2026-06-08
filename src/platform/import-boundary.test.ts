import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

type ImportRule = {
  label: string;
  predicate: (specifier: string) => boolean;
  allowlist?: Set<string>;
  guidance: string;
};

type ImportEdge = {
  from: string;
  specifier: string;
  resolved: string | null;
  resolvedKind: "alias" | "package" | "source" | "missing";
};

type ResolvedImportRule = {
  label: string;
  classLabel: string;
  matches: (edge: ImportEdge) => boolean;
  guidance: string;
};

type FileRule = {
  label: string;
  classLabel: string;
  matches: (projectPath: string) => boolean;
  guidance: string;
};

type ContentScanRule = {
  label: string;
  pattern: RegExp;
  allowlist?: Set<string>;
  guidance: string;
};

const SRC_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(SRC_DIR, "..");
const PLATFORM_DIR_PREFIX = "src/platform/";
const ACTIVE_RUNTIME_ROOTS = [
  "src/routes/+layout.svelte",
  "src/routes/(app)/+layout.svelte",
  "src/routes/(app)/+page.svelte",
  "src/routes/(app)/telemetry/+page.svelte",
  "src/routes/(app)/hud/+page.svelte",
  "src/routes/(app)/mission/+page.svelte",
  "src/routes/(app)/logs/+page.svelte",
  "src/routes/(app)/firmware/+page.svelte",
  "src/routes/(app)/setup/+layout.svelte",
  "src/routes/(app)/setup/+page.svelte",
  "src/routes/(app)/setup/frame-orientation/+page.svelte",
  "src/routes/(app)/setup/calibration/+page.svelte",
  "src/routes/(app)/setup/rc-receiver/+page.svelte",
  "src/routes/(app)/setup/navigation/+page.svelte",
  "src/routes/(app)/setup/battery-monitor/+page.svelte",
  "src/routes/(app)/setup/motors-esc/+page.svelte",
  "src/routes/(app)/setup/servo-outputs/+page.svelte",
  "src/routes/(app)/setup/serial-ports/+page.svelte",
  "src/routes/(app)/setup/flight-modes/+page.svelte",
  "src/routes/(app)/setup/failsafe/+page.svelte",
  "src/routes/(app)/setup/rtl-return/+page.svelte",
  "src/routes/(app)/setup/geofence/+page.svelte",
  "src/routes/(app)/setup/arming/+page.svelte",
  "src/routes/(app)/setup/initial-params/+page.svelte",
  "src/routes/(app)/setup/pid-tuning/+page.svelte",
  "src/routes/(app)/setup/peripherals/+page.svelte",
  "src/routes/(app)/setup/full-parameters/+page.svelte",
  "src/routes/(app)/settings/+page.svelte",
] as const;
const ACTIVE_SCAN_ROOTS = [
  { label: "src", dir: SRC_DIR },
  { label: "e2e", dir: resolve(REPO_ROOT, "e2e") },
  { label: "e2e-native", dir: resolve(REPO_ROOT, "e2e-native") },
] as const;
const ACTIVE_RUNTIME_TIMEOUT_MS = 5_000;
const ACTIVE_RUNTIME_RESOLVE_EXTENSIONS = ["", ".ts", ".tsx", ".svelte", ".js", ".jsx", ".mjs", ".cjs"] as const;

const IMPORT_SPECIFIER_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const SOURCE_FILE_RE = /(?:\.svelte(?:\.(?:ts|js))?|\.(?:ts|tsx))$/;
const IMPORT_SCAN_FILE_RE = /(?:\.svelte(?:\.(?:ts|js))?|\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts))$/;
const TEST_FILE_RE = /\.(?:test|spec)\.(?:svelte(?:\.(?:ts|js))?|ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const SVELTE_FILE_RE = /\.svelte$/;
const REACT_PACKAGE_RE = /^(?:react|react-dom|@testing-library\/react)(?:\/|$)/;
const LUCIDE_REACT_PACKAGE_RE = /^(?:lucide-react)(?:\/|$)/;
const ARCHIVED_REACT_SOURCE_RE = /(^|\/)src-old\/(?:legacy|runtime)(?:\/|$)/;
const ARCHIVED_TEST_SPECIFIER_RE = /(^|\/)src-old\/(?:e2e|legacy\/.*\.(?:test|spec)\.)/;

const DIRECT_TAURI_IMPORT_RULES: ImportRule[] = [
  {
    label: "@tauri-apps/api/core",
    predicate: (specifier) => specifier === "@tauri-apps/api/core",
    allowlist: new Set(["src/platform/tauri/core.ts"]),
    guidance: "Use @platform/core instead.",
  },
  {
    label: "@tauri-apps/api/event",
    predicate: (specifier) => specifier === "@tauri-apps/api/event",
    allowlist: new Set(["src/platform/tauri/event.ts"]),
    guidance: "Use @platform/event instead.",
  },
  {
    label: "@tauri-apps/plugin-http",
    predicate: (specifier) => specifier === "@tauri-apps/plugin-http",
    allowlist: new Set(["src/platform/tauri/http.ts"]),
    guidance: "Use @platform/http instead.",
  },
];

const DIRECT_APTABASE_IMPORT_RULES: ImportRule[] = [
  {
    label: "@aptabase/web",
    predicate: (specifier) => specifier === "@aptabase/web",
    allowlist: new Set(["src/platform/web/analytics.ts"]),
    guidance: "Use src/lib/analytics/* and the @platform/analytics adapter instead.",
  },
];

const DIRECT_ANALYTICS_ADAPTER_IMPORT_RULES: ImportRule[] = [
  {
    label: "@platform/analytics",
    predicate: (specifier) => specifier === "@platform/analytics",
    allowlist: new Set(["src/lib/analytics/client.ts"]),
    guidance: "Use the shared src/lib/analytics client instead of binding feature code to platform adapters.",
  },
];

const DIRECT_PLATFORM_IPC_IMPORT_RULES: ImportRule[] = [
  {
    label: "@platform/core",
    predicate: (specifier) => specifier === "@platform/core",
    allowlist: new Set([
      "src/lib/ipc/client.ts",
      "src/platform/tauri/analytics.ts",
      "src/components/ui/ExternalLink.svelte",
    ]),
    guidance:
      "Use src/lib/ipc/client typedInvoke for IronWing command IPC. Analytics platform adapters and the shared external-link openUrl primitive stay on separate raw platform paths.",
  },
  {
    label: "@platform/event",
    predicate: (specifier) => specifier === "@platform/event",
    allowlist: new Set(["src/lib/ipc/client.ts"]),
    guidance: "Use src/lib/ipc/client typedListen for IronWing event IPC.",
  },
];

const UI_PRIMITIVE_DIR_PREFIX = "src/components/ui/";

const RAW_ANCHOR_ALLOWLIST = new Set([
  // SvelteKit internal route navigation intentionally uses native anchors.
  "src/app/shell/AppShellHeader.svelte",
  "src/features/setup/components/SetupWorkspaceSectionNav.svelte",
  "src/routes/(app)/setup/+page.svelte",
]);

const RAW_BUTTON_ALLOWLIST = new Set([
  "src/app/shell/AppShellHeader.svelte",
  "src/routes/(app)/hud/+page.svelte",
  "src/features/mission/components/MissionMap.svelte",
  "src/features/mission/components/MissionMapInteractiveLayer.svelte",
  "src/routes/(app)/setup/peripherals/+page.svelte",
  "src/features/setup/components/SetupWorkspaceShell.svelte",
]);

const RAW_FORM_CONTROL_ALLOWLIST = new Set([
  "src/features/logs/components/LogsReplayPanel.svelte",
]);

const RAW_COMPONENT_MARKUP_RULES: ContentScanRule[] = [
  {
    label: "raw external anchors outside shared UI",
    pattern: /<a\b/,
    allowlist: RAW_ANCHOR_ALLOWLIST,
    guidance:
      "Use the shared ExternalLink component for external links. If a plain anchor is truly required, add a narrowly-scoped allowlist entry with justification.",
  },
  {
    label: "raw buttons outside shared UI",
    pattern: /<button\b/,
    allowlist: RAW_BUTTON_ALLOWLIST,
    guidance:
      "Use shared Button, IconButton, ButtonGroup, SelectableCard, Dialog/Sheet triggers, or another UI primitive. Only dense map/HUD/dnd/shell exceptions should stay allowlisted.",
  },
  {
    label: "raw form controls outside shared UI",
    pattern: /<(?:input|select|textarea)\b|type=\"range\"/,
    allowlist: RAW_FORM_CONTROL_ALLOWLIST,
    guidance:
      "Use shared Field, Input, NumberInput, NativeSelect, Select, Checkbox, Switch, Slider, or a thin feature wrapper. Only dense behavior-driven exceptions should stay allowlisted.",
  },
];

const DIRECT_BITS_UI_IMPORT_RULE: {
  label: string;
  predicate: (specifier: string) => boolean;
  allowedDirPrefix: string;
  guidance: string;
} = {
  label: "bits-ui",
  predicate: (specifier) => specifier === "bits-ui" || specifier.startsWith("bits-ui/"),
  allowedDirPrefix: UI_PRIMITIVE_DIR_PREFIX,
  guidance:
    "Only wrappers under src/components/ui/ may import bits-ui directly. Feature components must consume the @/components/ui barrel (e.g. ContextMenu, Dialog, Menu, Select, Tooltip).",
};

const DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE: {
  label: string;
  predicate: (specifier: string) => boolean;
  allowedDirPrefix: string;
  guidance: string;
} = {
  label: "shared UI subfiles",
  predicate: (specifier) => /(?:^|\/)ui\/.+\.svelte$/.test(specifier),
  allowedDirPrefix: UI_PRIMITIVE_DIR_PREFIX,
  guidance:
    "Feature components must import from the src/components/ui barrel instead of reaching into individual UI .svelte files. Re-export needed primitives from src/components/ui/index.ts first.",
};

const ACTIVE_TREE_FILE_RULES: FileRule[] = [
  {
    label: "React-era .tsx/.jsx files inside active trees",
    classLabel: "active-path reach-through",
    matches: (projectPath) => /\.(?:tsx|jsx)$/.test(projectPath),
    guidance:
      "Keep active src/, e2e/, and e2e-native/ on Svelte/.ts/.mjs files only. Do not revive React-era files in the active tree.",
  },
];

const ACTIVE_TREE_IMPORT_RULES: ResolvedImportRule[] = [
  {
    label: "archived test imports",
    classLabel: "archived tests",
    matches: (edge) => isArchivedTestImport(edge),
    guidance:
      "Do not import removed legacy E2E helpers or React-era test files into active src/, e2e/, or e2e-native/. Rebuild any reusable helpers inside the active proof lane instead.",
  },
  {
    label: "archived React source imports",
    classLabel: "archived React source",
    matches: (edge) => isArchivedReactSourceImport(edge),
    guidance:
      "Do not import removed React-era runtime or component paths into active src/, e2e/, or e2e-native/. Rebuild the intent in active Svelte modules instead.",
  },
  {
    label: "React package imports",
    classLabel: "active-path reach-through",
    matches: (edge) => REACT_PACKAGE_RE.test(edge.specifier),
    guidance:
      "Do not reintroduce React packages into active src/, e2e/, or e2e-native/. Use Svelte components, neutral TypeScript helpers, and @testing-library/svelte instead.",
  },
  {
    label: "lucide-react package imports",
    classLabel: "active-path reach-through",
    matches: (edge) => LUCIDE_REACT_PACKAGE_RE.test(edge.specifier),
    guidance:
      "Do not reintroduce lucide-react into the active tree. Use lucide-svelte or neutral data instead of the archived React icon package.",
  },
];

const ACTIVE_RUNTIME_RULES: ResolvedImportRule[] = [
  {
    label: "React package imports",
    classLabel: "active-path reach-through",
    matches: (edge) => /^(?:react|react-dom)(?:\/|$)/.test(edge.specifier),
    guidance:
      "The active runtime graph reachable from the SvelteKit route/layout roots must stay on the shipped Svelte path. Replace React package usage with Svelte components, stores, or helpers.",
  },
  {
    label: "lucide-react package imports",
    classLabel: "active-path reach-through",
    matches: (edge) => /^(?:lucide-react)(?:\/|$)/.test(edge.specifier),
    guidance:
      "The active runtime graph must not reach React-era icon packages. Use lucide-svelte icons/assets or a neutral data module instead of lucide-react.",
  },
  {
    label: "React-era .tsx reach-through",
    classLabel: "active-path reach-through",
    matches: (edge) => edge.resolved?.endsWith(".tsx") ?? false,
    guidance:
      "Do not import .tsx modules anywhere in the active runtime graph. Keep the shipped Svelte path on .svelte/.ts modules or wrap the dependency behind a neutral boundary first.",
  },
  {
    label: "src/types.ts helper trap",
    classLabel: "active-path reach-through",
    matches: (edge) => edge.resolved === "src/types.ts" || /(?:^|\/)src\/types(?:\.ts)?$/.test(edge.specifier),
    guidance:
      "Do not route the active runtime through src/types.ts. Move shared non-React types into a neutral module or define a Svelte-local type instead.",
  },
  {
    label: "archived React source imports",
    classLabel: "archived React source",
    matches: (edge) => isArchivedReactSourceImport(edge),
    guidance:
      "Do not reach into removed React-era paths. Keep the active runtime independent from the old React tree.",
  },
  {
    label: "direct platform implementation imports",
    classLabel: "active-path reach-through",
    matches: (edge) =>
      /(?:^|\/)platform\/(?:mock|tauri)(?:\/|$)/.test(edge.specifier) ||
      (edge.resolved?.startsWith("src/platform/mock/") ?? false) ||
      (edge.resolved?.startsWith("src/platform/tauri/") ?? false),
    guidance:
      "Use the @platform/core, @platform/event, and @platform/http aliases instead of importing platform implementations directly.",
  },
];

function normalizeProjectPath(file: string): string {
  return relative(REPO_ROOT, file).replace(/\\/g, "/");
}

function walkFiles(
  dir: string,
  filePattern: RegExp,
  options?: { includeTests?: boolean },
): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const results: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;

    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, filePattern, options));
      continue;
    }

    if (!filePattern.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
    if (!options?.includeTests && TEST_FILE_RE.test(entry.name)) continue;

    results.push(full);
  }

  return results;
}

function walkSourceFiles(dir: string): string[] {
  return walkFiles(dir, SOURCE_FILE_RE, { includeTests: false });
}

function walkSvelteSourceFiles(dir: string): string[] {
  return walkFiles(dir, SVELTE_FILE_RE, { includeTests: false });
}

function walkImportScanFiles(dir: string): string[] {
  return walkFiles(dir, IMPORT_SCAN_FILE_RE, { includeTests: true });
}

function extractImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();

  for (const pattern of IMPORT_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.add(match[1]);
    }
  }

  return [...specifiers];
}

function scanFiles(rule: ImportRule, options?: { skipPlatformFiles?: boolean }): string[] {
  const violations: string[] = [];

  for (const file of walkSourceFiles(SRC_DIR)) {
    const projectRel = normalizeProjectPath(file);
    if (rule.allowlist?.has(projectRel)) continue;
    if (options?.skipPlatformFiles && projectRel.startsWith(PLATFORM_DIR_PREFIX)) continue;

    const content = readFileSync(file, "utf-8");
    const matches = extractImportSpecifiers(content).filter(rule.predicate);
    if (matches.length > 0) {
      violations.push(`${projectRel} -> ${matches.join(", ")}`);
    }
  }

  return violations.sort();
}

function scanSvelteMarkup(rule: ContentScanRule): string[] {
  const violations: string[] = [];

  for (const file of walkSvelteSourceFiles(SRC_DIR)) {
    const projectRel = normalizeProjectPath(file);
    if (projectRel.startsWith(UI_PRIMITIVE_DIR_PREFIX)) continue;
    if (projectRel.startsWith("src/test/")) continue;
    if (rule.allowlist?.has(projectRel)) continue;

    const content = readFileSync(file, "utf-8");
    if (rule.pattern.test(content)) {
      violations.push(projectRel);
    }
  }

  return violations.sort();
}

function resolveImport(fromFile: string, specifier: string): ImportEdge {
  if (specifier.startsWith("@platform/")) {
    return {
      from: fromFile,
      specifier,
      resolved: specifier,
      resolvedKind: "alias",
    };
  }

  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return {
      from: fromFile,
      specifier,
      resolved: specifier,
      resolvedKind: "package",
    };
  }

  const absoluteBase = resolve(dirname(resolve(REPO_ROOT, fromFile)), specifier);
  const candidates = [
    ...ACTIVE_RUNTIME_RESOLVE_EXTENSIONS.map((extension) => `${absoluteBase}${extension}`),
    ...ACTIVE_RUNTIME_RESOLVE_EXTENSIONS
      .filter((extension) => extension.length > 0)
      .map((extension) => join(absoluteBase, `index${extension}`)),
  ];

  const resolvedCandidate = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!resolvedCandidate) {
    return {
      from: fromFile,
      specifier,
      resolved: null,
      resolvedKind: "missing",
    };
  }

  return {
    from: fromFile,
    specifier,
    resolved: normalizeProjectPath(resolvedCandidate),
    resolvedKind: "source",
  };
}

function collectImportEdges(dirs: readonly { dir: string; label: string }[]): ImportEdge[] {
  const edges: ImportEdge[] = [];

  for (const root of dirs) {
    for (const file of walkImportScanFiles(root.dir)) {
      const projectRel = normalizeProjectPath(file);
      const content = readFileSync(file, "utf-8");
      for (const specifier of extractImportSpecifiers(content)) {
        edges.push(resolveImport(projectRel, specifier));
      }
    }
  }

  return edges;
}

function collectProjectFiles(dirs: readonly { dir: string; label: string }[]): string[] {
  return dirs.flatMap((root) => walkImportScanFiles(root.dir).map((file) => normalizeProjectPath(file)));
}

function buildActiveRuntimeGraph(rootFiles: readonly string[]): ImportEdge[] {
  const queue = [...rootFiles];
  const visited = new Set<string>();
  const edges: ImportEdge[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const absolute = resolve(REPO_ROOT, current);
    const content = readFileSync(absolute, "utf-8");

    for (const specifier of extractImportSpecifiers(content)) {
      const edge = resolveImport(current, specifier);
      edges.push(edge);

      if (edge.resolvedKind === "source" && edge.resolved && !visited.has(edge.resolved)) {
        queue.push(edge.resolved);
      }
    }
  }

  return edges;
}

function formatImportEdge(edge: ImportEdge): string {
  if (edge.resolvedKind === "source") {
    return `${edge.from} imports ${JSON.stringify(edge.specifier)} -> ${edge.resolved}`;
  }

  if (edge.resolvedKind === "missing") {
    return `${edge.from} imports ${JSON.stringify(edge.specifier)} -> <unresolved>`;
  }

  return `${edge.from} imports ${JSON.stringify(edge.specifier)}`;
}

function findFirstImportViolation(edges: ImportEdge[], rule: ResolvedImportRule): ImportEdge | null {
  return edges.find((edge) => rule.matches(edge)) ?? null;
}

function findFirstFileViolation(files: string[], rule: FileRule): string | null {
  return files.find((projectPath) => rule.matches(projectPath)) ?? null;
}

function isArchivedReactSourceImport(edge: ImportEdge): boolean {
  return ARCHIVED_REACT_SOURCE_RE.test(edge.specifier) || isArchivedReactSourcePath(edge.resolved);
}

function isArchivedReactSourcePath(projectPath: string | null): boolean {
  return projectPath !== null && ARCHIVED_REACT_SOURCE_RE.test(projectPath);
}

function isArchivedTestImport(edge: ImportEdge): boolean {
  return ARCHIVED_TEST_SPECIFIER_RE.test(edge.specifier) || isArchivedTestPath(edge.resolved);
}

function isArchivedTestPath(projectPath: string | null): boolean {
  return (
    projectPath !== null &&
    (projectPath.startsWith("src-old/e2e/") || (projectPath.startsWith("src-old/legacy/") && TEST_FILE_RE.test(projectPath)))
  );
}

describe("platform import boundary", () => {
  for (const rule of [
    ...DIRECT_TAURI_IMPORT_RULES,
    ...DIRECT_APTABASE_IMPORT_RULES,
    ...DIRECT_ANALYTICS_ADAPTER_IMPORT_RULES,
    ...DIRECT_PLATFORM_IPC_IMPORT_RULES,
  ]) {
    it(
      `no files outside the allowlist import ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const violations = scanFiles(rule);
        expect(
          violations,
          `Unexpected direct ${rule.label} imports in:\n  ${violations.join("\n  ")}\n\n${rule.guidance} Only ${[
            ...(rule.allowlist ?? []),
          ].join(", ")} may import ${rule.label} directly.`,
        ).toEqual([]);
      },
    );
  }

  it(
    `only ${DIRECT_BITS_UI_IMPORT_RULE.allowedDirPrefix} files import ${DIRECT_BITS_UI_IMPORT_RULE.label}`,
    {
      timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
    },
    () => {
      const violations: string[] = [];

      for (const file of walkSourceFiles(SRC_DIR)) {
        const projectRel = normalizeProjectPath(file);
        if (projectRel.startsWith(DIRECT_BITS_UI_IMPORT_RULE.allowedDirPrefix)) continue;

        const content = readFileSync(file, "utf-8");
        const matches = extractImportSpecifiers(content).filter(DIRECT_BITS_UI_IMPORT_RULE.predicate);
        if (matches.length > 0) {
          violations.push(`${projectRel} -> ${matches.join(", ")}`);
        }
      }

      expect(
        violations.sort(),
        `Unexpected direct ${DIRECT_BITS_UI_IMPORT_RULE.label} imports in:\n  ${violations.join("\n  ")}\n\n${DIRECT_BITS_UI_IMPORT_RULE.guidance}`,
      ).toEqual([]);
    },
  );

  it(
    `only ${DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.allowedDirPrefix} files import ${DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.label}`,
    {
      timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
    },
    () => {
      const violations: string[] = [];

      for (const file of walkSourceFiles(SRC_DIR)) {
        const projectRel = normalizeProjectPath(file);
        if (projectRel.startsWith(DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.allowedDirPrefix)) continue;

        const content = readFileSync(file, "utf-8");
        const matches = extractImportSpecifiers(content).filter(DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.predicate);
        if (matches.length > 0) {
          violations.push(`${projectRel} -> ${matches.join(", ")}`);
        }
      }

      expect(
        violations.sort(),
        `Unexpected direct ${DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.label} imports in:\n  ${violations.join("\n  ")}\n\n${DIRECT_SHARED_UI_SUBFILE_IMPORT_RULE.guidance}`,
      ).toEqual([]);
    },
  );

  for (const rule of ACTIVE_RUNTIME_RULES) {
    it(
      `the active runtime graph does not use ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const graph = buildActiveRuntimeGraph(ACTIVE_RUNTIME_ROOTS);
        const violation = findFirstImportViolation(graph, rule);

        expect(
          violation,
          violation
            ? `Active runtime violation [${rule.classLabel}]: ${formatImportEdge(violation)}\n\n${rule.guidance}`
            : `Checked ${graph.length} active-runtime imports from ${ACTIVE_RUNTIME_ROOTS.join(", ")} with no ${rule.label} violations.`,
        ).toBeNull();
      },
    );
  }
});

describe("shared UI markup guardrails", () => {
  for (const rule of RAW_COMPONENT_MARKUP_RULES) {
    it(
      `active Svelte components do not use ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const violations = scanSvelteMarkup(rule);
        expect(
          violations,
          `Unexpected ${rule.label} in:\n  ${violations.join("\n  ")}\n\n${rule.guidance}${
            rule.allowlist && rule.allowlist.size > 0
              ? ` Current allowlist: ${[...rule.allowlist].join(", ")}.`
              : ""
          }`,
        ).toEqual([]);
      },
    );
  }
});

describe("active tree archive guardrails", () => {
  for (const rule of ACTIVE_TREE_FILE_RULES) {
    it(
      `the active src/e2e trees do not include ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const files = collectProjectFiles(ACTIVE_SCAN_ROOTS);
        const violation = findFirstFileViolation(files, rule);

        expect(
          violation,
          violation
            ? `Active tree violation [${rule.classLabel}]: ${violation}\n\n${rule.guidance}`
            : `Checked ${files.length} active-tree files across ${ACTIVE_SCAN_ROOTS.map((root) => root.label).join(", ")} with no ${rule.label} violations.`,
        ).toBeNull();
      },
    );
  }

  for (const rule of ACTIVE_TREE_IMPORT_RULES) {
    it(
      `the active src/e2e trees do not import ${rule.label}`,
      {
        timeout: ACTIVE_RUNTIME_TIMEOUT_MS,
      },
      () => {
        const edges = collectImportEdges(ACTIVE_SCAN_ROOTS);
        const violation = findFirstImportViolation(edges, rule);

        expect(
          violation,
          violation
            ? `Active tree violation [${rule.classLabel}]: ${formatImportEdge(violation)}\n\n${rule.guidance}`
            : `Checked ${edges.length} active-tree imports across ${ACTIVE_SCAN_ROOTS.map((root) => root.label).join(", ")} with no ${rule.label} violations.`,
        ).toBeNull();
      },
    );
  }
});

describe("active runtime boundary helper rules", () => {
  const fixtureSource = "src/routes/(app)/+page.svelte";

  it.each([
    {
      label: "react package imports",
      edge: {
        from: fixtureSource,
        specifier: "react",
        resolved: "react",
        resolvedKind: "package",
      } satisfies ImportEdge,
      ruleLabel: "React package imports",
    },
    {
      label: "lucide-react package imports",
      edge: {
        from: fixtureSource,
        specifier: "lucide-react",
        resolved: "lucide-react",
        resolvedKind: "package",
      } satisfies ImportEdge,
      ruleLabel: "lucide-react package imports",
    },
    {
      label: ".tsx reach-through",
      edge: {
        from: fixtureSource,
        specifier: "../components/LegacyPanel",
        resolved: "src/components/LegacyPanel.tsx",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "React-era .tsx reach-through",
    },
    {
      label: "src/types helper trap",
      edge: {
        from: fixtureSource,
        specifier: "../types",
        resolved: "src/types.ts",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "src/types.ts helper trap",
    },
    {
      label: "archived React source reach-through",
      edge: {
        from: fixtureSource,
        specifier: "../src-old/runtime/App",
        resolved: "src-old/runtime/App.tsx",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "archived React source imports",
    },
    {
      label: "direct platform implementation imports",
      edge: {
        from: fixtureSource,
        specifier: "../platform/tauri/core",
        resolved: "src/platform/tauri/core.ts",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "direct platform implementation imports",
    },
  ])("flags $label as an active-runtime violation", ({ edge, ruleLabel }) => {
    const rule = ACTIVE_RUNTIME_RULES.find((candidate) => candidate.label === ruleLabel);
    expect(rule, `Missing active-runtime rule ${ruleLabel}.`).toBeTruthy();
    expect(findFirstImportViolation([edge], rule!)).toEqual(edge);
  });
});

describe("active runtime import resolver", () => {
  it("prefers facade source files over same-name internal folders", () => {
    expect(resolveImport("src/lib/survey-region.ts", "./mission-draft-typed").resolved).toBe(
      "src/lib/mission-draft-typed.ts",
    );
    expect(resolveImport("src/lib/survey-region.ts", "./mission-plan-io").resolved).toBe(
      "src/lib/mission-plan-io.ts",
    );
  });
});

describe("active tree helper rules", () => {
  it.each([
    {
      label: "archived tests",
      edge: {
        from: "e2e/smoke.spec.ts",
        specifier: "../src-old/e2e/helpers/setup-flow",
        resolved: "src-old/e2e/helpers/setup-flow.ts",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "archived test imports",
    },
    {
      label: "archived React source",
      edge: {
        from: "src/lib/example.ts",
        specifier: "../../src-old/legacy/components/Sidebar",
        resolved: "src-old/legacy/components/Sidebar.tsx",
        resolvedKind: "source",
      } satisfies ImportEdge,
      ruleLabel: "archived React source imports",
    },
    {
      label: "React package imports",
      edge: {
        from: "src/lib/example.test.ts",
        specifier: "@testing-library/react",
        resolved: "@testing-library/react",
        resolvedKind: "package",
      } satisfies ImportEdge,
      ruleLabel: "React package imports",
    },
    {
      label: "lucide-react package imports",
      edge: {
        from: "e2e/legacy-assertions.ts",
        specifier: "lucide-react",
        resolved: "lucide-react",
        resolvedKind: "package",
      } satisfies ImportEdge,
      ruleLabel: "lucide-react package imports",
    },
  ])("flags $label as an active-tree import violation", ({ edge, ruleLabel }) => {
    const rule = ACTIVE_TREE_IMPORT_RULES.find((candidate) => candidate.label === ruleLabel);
    expect(rule, `Missing active-tree rule ${ruleLabel}.`).toBeTruthy();
    expect(findFirstImportViolation([edge], rule!)).toEqual(edge);
  });

  it.each([
    {
      label: "React-era .tsx/.jsx files inside active trees",
      projectPath: "src/components/LegacyPanel.tsx",
    },
    {
      label: "React-era .tsx/.jsx files inside active trees",
      projectPath: "e2e/legacy-shell.jsx",
    },
  ])("flags $projectPath as an active-tree file violation", ({ label, projectPath }) => {
    const rule = ACTIVE_TREE_FILE_RULES.find((candidate) => candidate.label === label);
    expect(rule, `Missing active-tree file rule ${label}.`).toBeTruthy();
    expect(findFirstFileViolation([projectPath], rule!)).toBe(projectPath);
  });
});
