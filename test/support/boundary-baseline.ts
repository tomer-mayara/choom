import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { BaselineV6 } from "@choom/baseline-model/contracts";

export type BoundaryExample = "before" | "after" | "partial" | "policy";

export function boundaryFile(example: BoundaryExample = "after"): string {
  return fileURLToPath(new URL(`../fixtures/baseline-viewer/boundary-${example}.yaml`, import.meta.url));
}

export function boundaryBytes(example: BoundaryExample = "after"): string {
  return readFileSync(boundaryFile(example), "utf8");
}

export function boundaryFixture(example: BoundaryExample = "after"): BaselineV6 {
  return parse(boundaryBytes(example)) as BaselineV6;
}
