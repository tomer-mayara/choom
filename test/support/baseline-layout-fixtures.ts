import type {
  Baseline, BaselineComponent, BaselineInterface, BaselineResource, BaselineRule,
} from "../../src/domain/generated/contracts.ts";
import { proposed } from "./baseline-fixtures.ts";

function component(index: number): BaselineComponent {
  return {
    id: `component-${index}`, name: `Component ${index}`,
    purpose: proposed("A component in a display-limit baseline"),
    membership: proposed({ paths: [`component-${index}/**`] }),
    groupingReason: proposed("These files belong to this component"),
  };
}

function architectureInterface(index: number): BaselineInterface {
  return {
    id: `interface-${index}`, name: `Interface ${index}`,
    owner: proposed(null), publicAccess: proposed(null),
    allowedConsumers: proposed(null), promises: proposed(null),
  };
}

function resource(index: number): BaselineResource {
  return {
    id: `resource-${index}`, name: `Resource ${index}`, identity: proposed(null),
    owner: proposed(null), accessRules: proposed(null),
  };
}

function rule(index: number): BaselineRule {
  return {
    id: `rule-${index}`, name: `Rule ${index}`, subject: proposed({}),
    expected: proposed({}), check: proposed(null),
  };
}

export function baselineWithComponents(count: number): Baseline {
  return {
    formatVersion: 1, id: "component-count", parentId: null,
    components: Array.from({ length: count }, (_, index) => component(index)),
    interfaces: [], resources: [], rules: [],
  };
}

export function baselineWithRecords(count: number): Baseline {
  const perCollection = Math.floor(count / 4);
  return {
    ...baselineWithComponents(perCollection), id: "record-count",
    interfaces: Array.from({ length: perCollection }, (_, index) => architectureInterface(index)),
    resources: Array.from({ length: perCollection }, (_, index) => resource(index)),
    rules: Array.from({ length: count - 3 * perCollection }, (_, index) => rule(index)),
  };
}

export function baselineWithRules(count: number): Baseline {
  return {
    ...baselineWithComponents(0), id: "rules-only-count",
    rules: Array.from({ length: count }, (_, index) => rule(index)),
  };
}

export function baselineWithLinks(count: number): Baseline {
  const baseline = baselineWithComponents(100);
  baseline.id = "explicit-link-count";
  let remaining = count;
  while (remaining > 0) {
    const item = architectureInterface(baseline.interfaces.length);
    item.owner = proposed("component-0");
    const consumers = Math.min(remaining - 1, baseline.components.length);
    item.allowedConsumers = proposed(consumers > 0
      ? baseline.components.slice(0, consumers).map(({ id }) => id) : null);
    baseline.interfaces.push(item);
    remaining -= 1 + consumers;
  }
  return baseline;
}

export function baselineWithParentLevels(levels: number): Baseline {
  const baseline = baselineWithComponents(levels);
  baseline.id = "parent-depth";
  for (const [index, item] of baseline.components.entries()) {
    if (index > 0) item.parent = proposed(`component-${index - 1}`);
  }
  return baseline;
}

export function baselineAtComponentLimits(): Baseline {
  const baseline = baselineWithComponents(500);
  baseline.id = "component-display-limits";
  for (const [index, item] of baseline.components.entries()) {
    if (index > 0) item.parent = proposed(`component-${Math.min(index - 1, 14)}`);
  }
  return baseline;
}

export function baselineOverDisplayLimit(limit: string): Baseline {
  switch (limit) {
    case "total record count": return baselineWithRecords(501);
    case "rules-only record count": return baselineWithRules(501);
    case "explicit link count": return baselineWithLinks(2_001);
    case "parent depth": return baselineWithParentLevels(17);
    default: throw new Error(`Unknown display limit: ${limit}`);
  }
}
