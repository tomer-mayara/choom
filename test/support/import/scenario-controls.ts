import assert from "node:assert/strict";

export class ScenarioControls {
  private expected = new Map<string, number>();
  private observed = new Map<string, string[]>();

  require(event: string): void {
    this.expected.set(event, (this.expected.get(event) ?? 0) + 1);
  }

  observe(event: string, evidence: string): void {
    assert.ok(this.expected.has(event), `Unexpected scenario input observation: ${event}`);
    this.observed.set(event, [...(this.observed.get(event) ?? []), evidence]);
  }

  wasObserved(event: string): boolean {
    return this.expected.has(event) && (this.observed.get(event)?.length ?? 0) >= (this.expected.get(event) ?? 0);
  }

  isRequired(event: string): boolean {
    return this.expected.has(event);
  }

  report(): { event: string; required: number; evidence: string[] }[] {
    return [...this.expected].map(([event, required]) => ({ event, required, evidence: this.observed.get(event) ?? [] }));
  }

  assertObserved(): void {
    const missing = this.report().filter(({ required, evidence }) => evidence.length < required);
    assert.deepEqual(missing, [], "The scenario did not exercise its required inputs or controls. Recorded reports and Choom fault controls need generated TypeSpec transport bindings; staged fixture facts are not runtime evidence.");
  }
}
