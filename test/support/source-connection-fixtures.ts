import { fixtureItem, proposed } from "./baseline-fixtures.ts";
import { sourceUsageBaseline } from "./source-usage-fixtures.ts";

export function sourceConnectionBaseline(example: string) {
  const baseline = sourceUsageBaseline();
  const item = fixtureItem(baseline.interfaces);
  const assessment = fixtureItem(baseline.sourceUsage.assessments);
  const use = fixtureItem(assessment.uses);
  switch (example) {
    case "repeated sites":
      assessment.uses.push({ ...structuredClone(use), id: "checkout-second-site", description: "A second reviewed invoice call." });
      break;
    case "different permission":
      baseline.components.push({ ...structuredClone(fixtureItem(baseline.components)), id: "admin", name: "Admin" });
      item.allowedConsumers = proposed(["admin"]);
      break;
    case "tooling": use.context = "tooling"; break;
    case "type and test":
      use.kind = "type";
      assessment.uses.push({ ...structuredClone(use), id: "invoice-test", kind: "value", context: "test" });
      break;
    case "unmapped caller":
      assessment.uses.push({ ...structuredClone(use), id: "unmapped-site", consumerId: null,
        description: "The caller file has no resolved component owner." });
      break;
    case "self use":
      assessment.uses.push({ ...structuredClone(use), id: "billing-site", consumerId: "billing" });
      break;
    case "no source data":
      item.allowedConsumers = proposed(["checkout"]);
      Reflect.deleteProperty(baseline, "sourceUsage");
      break;
    case "legacy 1":
    case "legacy 2":
      item.allowedConsumers = proposed(["checkout"]);
      Reflect.deleteProperty(baseline, "sourceUsage");
      Object.assign(baseline, { formatVersion: example === "legacy 1" ? 1 : 2 });
      if (example === "legacy 1") Reflect.deleteProperty(item, "documentation");
      break;
    default: throw new Error(`Unknown source connection example: ${example}`);
  }
  return baseline;
}
