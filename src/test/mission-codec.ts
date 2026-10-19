// Exercise the actual Rust/SDK codec in pure Node tests. Browser flows remain in E2E.
import { readFileSync } from "node:fs";
import { vi } from "vitest";

vi.mock("../lib/ipc/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/ipc/client")>();
  const wasm = await import("../platform/web/generated/ironwing_wasm.js");
  wasm.initSync({ module: readFileSync("src/platform/web/generated/ironwing_wasm_bg.wasm") });
  const runtime = new wasm.IronwingWasmRuntime(() => {});
  return {
    ...original,
    typedInvoke: (command: string, args: { commands: unknown[] }) => {
      if (command === "mission_commands_decode") return Promise.resolve(runtime.missionCommandsDecode(args.commands));
      if (command === "mission_commands_encode") return Promise.resolve(runtime.missionCommandsEncode(args.commands));
      return Reflect.apply(original.typedInvoke, null, [command, args]);
    },
  };
});
