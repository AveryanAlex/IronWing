import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { captureCommand, createCleanupRunner, runCommand } from "./workflow/process.mjs";
import { SITL_HOME, SITL_IMAGE, resolveRequestedRuntime, runtimeForInstance } from "./workflow/runtime.mjs";
import { waitForTcp } from "./workflow/wait.mjs";

const repoRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const fixtureDir = join(repoRoot, "src/platform/mock/backend/fixtures/params");
const exportBinManifest = join(repoRoot, "src-tauri/Cargo.toml");
const tcpReadyTimeoutMs = 180_000;
const exportRetryDelayMs = 2_000;

const variants = [
  {
    vehicleFamily: "copter",
    preset: "quadcopter",
    filename: "copter-defaults.json",
    tcpProbeSafe: true,
    source: {
      autopilot: "ArduCopter",
      sitl_image: SITL_IMAGE,
      defaults: "/ardupilot/Tools/autotest/default_params/copter.parm",
    },
    command(runtime) {
      return [
        "cd /ardupilot/ArduCopter",
        `../Tools/autotest/sim_vehicle.py -v ArduCopter -f quad --no-rebuild --no-mavproxy --speedup 1 --custom-location ${SITL_HOME} -I ${runtime.instanceId} -w`,
      ].join(" && ");
    },
  },
  {
    vehicleFamily: "plane",
    preset: "airplane",
    filename: "plane-defaults.json",
    tcpProbeSafe: false,
    source: {
      autopilot: "ArduPlane",
      sitl_image: SITL_IMAGE,
      defaults: "/ardupilot/Tools/autotest/models/plane.parm",
    },
    command(runtime) {
      return [
        "cd /ardupilot/ArduPlane",
        `../Tools/autotest/sim_vehicle.py -v ArduPlane -f plane --no-mavproxy --speedup 1 --custom-location ${SITL_HOME} -I ${runtime.instanceId} -w`,
      ].join(" && ");
    },
  },
  {
    vehicleFamily: "plane",
    preset: "quadplane",
    filename: "quadplane-defaults.json",
    tcpProbeSafe: false,
    source: {
      autopilot: "ArduPlane",
      sitl_image: SITL_IMAGE,
      defaults: "/ardupilot/Tools/autotest/default_params/quadplane.parm",
    },
    command(runtime) {
      return [
        "cd /ardupilot/ArduPlane",
        `../Tools/autotest/sim_vehicle.py -v ArduPlane -f quadplane --no-mavproxy --speedup 1 --custom-location ${SITL_HOME} -I ${runtime.instanceId} -w`,
      ].join(" && ");
    },
  },
];

function fixturePath(filename) {
  return join(fixtureDir, filename);
}

async function startVariant(runtime, variant) {
  await runCommand("docker", ["rm", "-f", runtime.sitlContainer], {
    cwd: repoRoot,
    allowFailure: true,
    stdio: "ignore",
  });

  await runCommand(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      runtime.sitlContainer,
      "-p",
      `${runtime.sitlTcpPort}:5760`,
      "--entrypoint",
      "/bin/sh",
      SITL_IMAGE,
      "-lc",
      variant.command(runtime),
    ],
    { cwd: repoRoot },
  );

  if (variant.tcpProbeSafe) {
    await waitForTcp("127.0.0.1", runtime.sitlTcpPort, tcpReadyTimeoutMs);
  }
}

async function stopVariant(runtime) {
  await runCommand("docker", ["rm", "-f", runtime.sitlContainer], {
    cwd: repoRoot,
    allowFailure: true,
    stdio: "ignore",
  });
}

function exportParams(tcpAddress, variant) {
  const raw = captureCommand(
    "bash",
    [
      "-lc",
      `cargo run --quiet --manifest-path "${exportBinManifest}" --bin export_demo_params -- "${tcpAddress}" 2>/dev/null`,
    ],
    {
      cwd: repoRoot,
      env: {
        IRONWING_DEMO_PARAM_VEHICLE_FAMILY: variant.vehicleFamily,
        IRONWING_DEMO_PARAM_VEHICLE_PRESET: variant.preset,
        IRONWING_DEMO_PARAM_SOURCE_JSON: JSON.stringify(variant.source),
      },
    },
  );

  return JSON.parse(raw);
}

async function exportParamsWithRetry(tcpAddress, variant) {
  const deadline = Date.now() + tcpReadyTimeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return exportParams(tcpAddress, variant);
    } catch (error) {
      lastError = error;
      // ArduPlane-family SITL uses a single-use wait-style console/socket during startup.
      // Avoid separate readiness probes that would steal that first connection; instead retry
      // the real exporter connection until the endpoint is ready or the bounded timeout expires.
      await delay(exportRetryDelayMs);
    }
  }

  throw lastError ?? new Error(`timed out exporting params from ${tcpAddress}`);
}

async function main() {
  mkdirSync(fixtureDir, { recursive: true });
  const cleanup = createCleanupRunner();
  const runtimeSeed = await resolveRequestedRuntime();

  try {
    for (const [index, variant] of variants.entries()) {
      const runtime = runtimeForInstance(runtimeSeed.instanceId, {
        sitlTcpPort: runtimeSeed.sitlTcpPort,
        sitlUdpPort: runtimeSeed.sitlUdpPort,
        sitlContainer: `${runtimeSeed.sitlContainer}-demo-${index}-${variant.preset}`,
      });

      cleanup.add(async () => {
        await stopVariant(runtime);
      });

      await startVariant(runtime, variant);
      const exported = await exportParamsWithRetry(runtime.tcpAddress, variant);
      writeFileSync(fixturePath(variant.filename), `${JSON.stringify(exported, null, 2)}\n`);
      await stopVariant(runtime);
    }
  } finally {
    await cleanup.run();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
