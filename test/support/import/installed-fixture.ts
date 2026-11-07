import assert from "node:assert/strict";
import { cp, lstat, mkdir, readlink, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ImportFixture } from "./fixtures.ts";

function contains(directory: string, path: string): boolean {
  const name = relative(directory, path);
  return name !== ".." && !name.startsWith(`..${sep}`) && !isAbsolute(name);
}

export async function installFixtureDependencies(fixture: ImportFixture): Promise<void> {
  const configured = process.env.CHOOM_PACKAGED_FIXTURE_MODULES;
  assert.ok(configured && isAbsolute(configured), "Packaged analysis requires an absolute CHOOM_PACKAGED_FIXTURE_MODULES directory");
  const modules = await realpath(configured);
  assert.ok(!contains(await realpath(process.cwd()), modules), "Packaged analyzer dependencies must be outside Choom's checkout");

  await mkdir(fixture.root, { recursive: true });
  const destination = join(fixture.root, "node_modules");
  await cp(modules, destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: async (source) => {
      if ((await lstat(source)).isSymbolicLink()) {
        const link = await readlink(source);
        assert.ok(!isAbsolute(link) && contains(modules, resolve(dirname(source), link)),
          "Packaged fixture dependencies must use relative links within their node_modules directory");
      }
      return true;
    },
  });

  const localModules = await realpath(destination);
  const analyzer = await realpath(join(localModules, "dependency-cruiser", "package.json"));
  const resolveFromAnalyzer = createRequire(analyzer).resolve;
  const parser = await realpath(resolveFromAnalyzer("typescript"));
  assert.ok(contains(localModules, analyzer) && contains(localModules, parser),
    "The copied analyzer and TypeScript parser must resolve within the fixture repository");

  fixture.files.set("package.json", JSON.stringify({
    private: true,
    devDependencies: { "dependency-cruiser": "18.7.2", typescript: "npm:@typescript/typescript6@6.0.2" },
  }));
}
