import { cpSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { toolsRoot } from "./commands.ts";

// The packages that Stages 3 to 6 accept only from inside the tool checkout.
const trustedPackages = new Set(["picomatch", "typescript", "yaml"]);

// A test copy of the tool checkout: the root package.json, the producer package
// and code, the baseline-model code and the producer documents. Its node_modules
// folder holds copies of the trusted packages and links to the other packages
// that this checkout installed.
export function copyToolCheckout(scratch: string): string {
  const tools = join(scratch, "tools");
  mkdirSync(join(tools, "docs/design"), { recursive: true });
  mkdirSync(join(tools, "packages/producer"), { recursive: true });
  mkdirSync(join(tools, "packages/baseline-model"), { recursive: true });
  mkdirSync(join(tools, "node_modules"));
  cpSync(join(toolsRoot, "package.json"), join(tools, "package.json"));
  cpSync(join(toolsRoot, "packages/producer/package.json"), join(tools, "packages/producer/package.json"));
  cpSync(join(toolsRoot, "packages/producer/src"), join(tools, "packages/producer/src"), { recursive: true });
  cpSync(join(toolsRoot, "packages/baseline-model/src"), join(tools, "packages/baseline-model/src"), { recursive: true });
  cpSync(join(toolsRoot, "docs/design/app-a"), join(tools, "docs/design/app-a"), { recursive: true });
  for (const name of readdirSync(join(toolsRoot, "node_modules"))) {
    const installed = join(toolsRoot, "node_modules", name);
    if (trustedPackages.has(name)) cpSync(installed, join(tools, "node_modules", name), { recursive: true });
    else symlinkSync(installed, join(tools, "node_modules", name));
  }
  return tools;
}
