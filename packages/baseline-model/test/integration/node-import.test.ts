import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const nodeMajor = readFileSync(`${repository}.node-version`, "utf8").trim().split(".")[0];

// The program runs from the repository root, so Node resolves the package through
// the workspace link, as a consumer does. It loads every public entry point.
const program = `
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";
import { baselineSchema } from "@choom/baseline-model";
import { supportsSourceUsage } from "@choom/baseline-model/baseline-format";
import "@choom/baseline-model/baseline-decisions";
import "@choom/baseline-model/contracts";
import "@choom/baseline-model/discovery-result";
import "@choom/baseline-model/item-statements";
import "@choom/baseline-model/readonly-data";

const input = parse(readFileSync("test/fixtures/baseline-viewer/source-consumers-review.yaml", "utf8"));
const accepted = baselineSchema.safeParse(input);
const refused = baselineSchema.safeParse({ ...input, parentId: input.id });
console.log(JSON.stringify({
  node: process.versions.node,
  bun: typeof Bun !== "undefined",
  accepted: accepted.success && isDeepStrictEqual(accepted.data, input),
  sourceUsage: accepted.success && supportsSourceUsage(accepted.data),
  refusedPaths: refused.success ? [] : refused.error.issues.map((issue) => issue.path.join(".")),
}));
`;

test("Node imports the package without a build step and validates a reviewed baseline", () => {
  const run = spawnSync("node", ["--input-type=module", "--eval", program], {
    cwd: repository, encoding: "utf8", timeout: 60_000,
  });
  expect({ status: run.status, stderr: run.stderr }).toEqual({ status: 0, stderr: "" });
  const result = JSON.parse(run.stdout) as Record<string, unknown>;
  expect(result.node).toStartWith(`${nodeMajor}.`);
  expect(result).toMatchObject({ bun: false, accepted: true, sourceUsage: true, refusedPaths: ["parentId"] });
}, 60_000);
