import { runCommand } from "./process.mjs";
import { SITL_DEFAULTS, SITL_HOME, SITL_IMAGE } from "./runtime.mjs";

export async function startSitl(runtime, { cwd } = {}) {
  await runCommand("docker", ["rm", "-f", runtime.sitlContainer], {
    cwd,
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
      "/ardupilot/build/sitl/bin/arducopter",
      SITL_IMAGE,
      "--model",
      "+",
      "--speedup",
      "1",
      "--defaults",
      SITL_DEFAULTS,
      "--home",
      SITL_HOME,
      "-w",
    ],
    { cwd },
  );
}

export async function stopSitl(runtime, { cwd } = {}) {
  await runCommand("docker", ["rm", "-f", runtime.sitlContainer], {
    cwd,
    allowFailure: true,
    stdio: "ignore",
  });
}
