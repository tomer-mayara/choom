import type { Baseline } from "../domain/generated/contracts.ts";

const maxRecords = 500;
const maxLinks = 2_000;
const maxLevels = 16;

export const displayLimitMessage = `Too large to display. Use at most ${maxRecords} records, ${maxLinks.toLocaleString("en-US")} explicit links, and ${maxLevels} component levels.`;

export class BaselineDisplayLimitError extends Error {
  constructor() {
    super(displayLimitMessage);
    this.name = "BaselineDisplayLimitError";
  }
}

/** Bound display work for a validated baseline before building its layout graph. */
export function checkBaselineDisplayLimits(baseline: Baseline): void {
  const records = baseline.components.length + baseline.interfaces.length
    + baseline.resources.length + baseline.rules.length;
  if (records > maxRecords) throw new BaselineDisplayLimitError();

  let links = 0;
  for (const item of baseline.interfaces) {
    links += (item.owner.value === null ? 0 : 1) + (item.allowedConsumers.value?.length ?? 0);
  }
  for (const item of baseline.resources) links += item.owner.value === null ? 0 : 1;
  if (links > maxLinks) throw new BaselineDisplayLimitError();

  const parents = new Map(baseline.components.map((item) => [item.id, item.parent?.value]));
  for (const component of baseline.components) {
    let levels = 1;
    let parent = parents.get(component.id);
    while (parent) {
      if (++levels > maxLevels) throw new BaselineDisplayLimitError();
      parent = parents.get(parent);
    }
  }
}
