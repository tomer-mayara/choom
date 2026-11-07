import assert from "node:assert/strict";
import type { ImportFixture } from "./fixtures.ts";

interface Gate { promise: Promise<void>; resolve: () => void }

/** Faults and delays live in the browser test host, outside the production bundle. */
export class BrowserImportControls {
  private readonly gates = new Map<string, Gate>();
  private readonly fixture: ImportFixture;
  private layoutHeld = false;
  private lateLayout = false;
  private lateCompletion?: Gate;

  constructor(fixture: ImportFixture) { this.fixture = fixture; }

  observe(event: string, evidence: string): void {
    if (this.fixture.controls.isRequired(event)) this.fixture.controls.observe(event, evidence);
  }

  async hold(name: string, event?: string): Promise<void> {
    assert.ok(!this.gates.has(name), `Only one ${name} operation may be held`);
    let resolve = () => {};
    const promise = new Promise<void>((finish) => { resolve = finish; });
    this.gates.set(name, { promise, resolve });
    if (event) this.observe(event, `The application requested ${name}; its public boundary is still pending`);
    await promise;
    this.gates.delete(name);
  }

  release(name: string): void {
    const gate = this.gates.get(name);
    assert.ok(gate, `The application must have requested the held ${name} operation`);
    gate.resolve();
  }

  releaseIfHeld(name: string): void { this.gates.get(name)?.resolve(); }

  isHeld(name: string): boolean { return this.gates.has(name); }

  async layout(phase: "before" | "completed", name: string): Promise<"continue" | "fail"> {
    if (phase === "completed") {
      if (this.lateLayout && name === "Abandoned") {
        this.observe("late-result-delivered", "Real ELK completed the abandoned layout after the newer document loaded");
        this.lateCompletion?.resolve();
      }
      return "continue";
    }
    if (this.fixture.facts.storageFailure === "arrange its component cards") {
      this.observe("arrange its component cards-failure-delivered", "The application invoked its layout dependency for the new candidate");
      return "fail";
    }
    const operation = this.fixture.facts.holdOperation;
    if (this.layoutHeld || (operation !== "layout" && operation !== "Abandoned")) return "continue";
    this.layoutHeld = true;
    if (operation === "layout") this.observe("analysis-completed-before-layout", "The application passed its analyzed candidate to layout");
    this.lateLayout = operation === "Abandoned";
    await this.hold("layout", this.lateLayout ? "cancelled-operation-held" : "layout-held");
    return "continue";
  }

  async releaseLateLayout(): Promise<void> {
    let resolve = () => {};
    const promise = new Promise<void>((finish) => { resolve = finish; });
    this.lateCompletion = { promise, resolve };
    this.release("layout");
    await promise;
  }

  releaseAll(): void {
    for (const gate of this.gates.values()) gate.resolve();
    this.lateCompletion?.resolve();
  }
}
