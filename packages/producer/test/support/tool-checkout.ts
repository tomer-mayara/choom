import { cpSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toolsRoot } from "./commands.ts";

// A test copy of the tool checkout: the root package.json, the producer code and
// the producer documents. node_modules links to this checkout's installed packages.
export function copyToolCheckout(scratch: string): string {
  const tools = join(scratch, "tools");
  mkdirSync(join(tools, "docs/design"), { recursive: true });
  mkdirSync(join(tools, "packages/producer"), { recursive: true });
  cpSync(join(toolsRoot, "package.json"), join(tools, "package.json"));
  cpSync(join(toolsRoot, "packages/producer/src"), join(tools, "packages/producer/src"), { recursive: true });
  cpSync(join(toolsRoot, "docs/design/app-a"), join(tools, "docs/design/app-a"), { recursive: true });
  symlinkSync(join(toolsRoot, "node_modules"), join(tools, "node_modules"));
  return tools;
}

// Replaces every producer code file and document in a copied checkout, except the
// files named in `keep`, with text that fails when a program runs or reads it.
export function breakProducerFiles(tools: string, keep: readonly string[]): string[] {
  const broken: string[] = [];
  for (const folder of ["packages/producer/src", "docs/design/app-a"])
    for (const name of readdirSync(join(tools, folder))) {
      if (keep.includes(name)) continue;
      writeFileSync(join(tools, folder, name), "throw new Error('The tool checkout changed.');\n");
      broken.push(name);
    }
  return broken;
}
