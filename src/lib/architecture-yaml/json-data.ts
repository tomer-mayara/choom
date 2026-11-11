import { invalidEncoding } from "./limits.ts";

export function assertJsonScalar(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))) return;
  invalidEncoding("The architecture document must contain JSON-compatible data.");
}
