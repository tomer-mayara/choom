import { stringify } from "yaml";

/**
 * A decision-file entry that accepts one statement of a saved baseline, in the
 * YAML format of the decision file (GA-01a, decision D22). A YAML comment that
 * names the baseline ID and the SHA-256 of its file comes first, so that the
 * reader can put the entry in the decision file of that baseline. A reader who
 * corrects the value changes the action and adds oldValue and newValue.
 */
export function decisionEntryText(baseline: { readonly id: string; readonly sha256: string }, itemId: string, field: string): string {
  return `# Baseline ${baseline.id}, SHA-256 ${baseline.sha256}\n${stringify([{ action: "accept", itemId, field }])}`;
}
