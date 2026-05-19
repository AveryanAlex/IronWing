import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.dirname(fileURLToPath(new URL("../../package.json", import.meta.url)));
export const webGeneratedDir = path.join(projectRoot, "src/platform/web/generated");

export function forwardedArgs(argv = process.argv.slice(2)) {
  const args = [...argv];
  if (args[0] === "--") {
    args.shift();
  }

  return args;
}
