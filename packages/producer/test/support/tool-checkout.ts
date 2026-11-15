import { cpSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { toolsRoot } from "./commands.ts";

// The packages that Stages 3 to 6 accept only from inside the tool checkout. The
// @vscode folder holds @vscode/ripgrep and the ripgrep program of this platform, and
// the @ts-morph folder holds the code and the TypeScript of ts-morph.
const trustedPackages = new Set(["@ts-morph", "@vscode", "picomatch", "ts-morph", "yaml"]);

// A test copy of the tool checkout: the root package.json, the producer package
// and code, the baseline-model package and code and the producer documents. Its
// node_modules folder holds copies of the trusted packages, links from the
// workspace names to the copied workspaces, as in this checkout, and links to the
// other packages that this checkout installed.
export function copyToolCheckout(scratch: string): string {
  const tools = join(scratch, "tools");
  mkdirSync(join(tools, "docs/design"), { recursive: true });
  mkdirSync(join(tools, "packages/producer"), { recursive: true });
  mkdirSync(join(tools, "packages/baseline-model"), { recursive: true });
  mkdirSync(join(tools, "node_modules/@choom"), { recursive: true });
  cpSync(join(toolsRoot, "package.json"), join(tools, "package.json"));
  for (const workspace of ["producer", "baseline-model"]) {
    cpSync(join(toolsRoot, "packages", workspace, "package.json"), join(tools, "packages", workspace, "package.json"));
    cpSync(join(toolsRoot, "packages", workspace, "src"), join(tools, "packages", workspace, "src"), { recursive: true });
    symlinkSync(join("../../packages", workspace), join(tools, "node_modules/@choom", workspace));
  }
  cpSync(join(toolsRoot, "docs/design/app-a"), join(tools, "docs/design/app-a"), { recursive: true });
  for (const name of readdirSync(join(toolsRoot, "node_modules"))) {
    const installed = join(toolsRoot, "node_modules", name);
    if (name === "@choom") continue;
    if (trustedPackages.has(name)) cpSync(installed, join(tools, "node_modules", name), { recursive: true });
    else symlinkSync(installed, join(tools, "node_modules", name));
  }
  return tools;
}
