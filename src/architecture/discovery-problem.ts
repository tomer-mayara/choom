import type { DiscoveryFailureCode } from "./generated/contracts";

export class DiscoveryProblem extends Error {
  readonly code: DiscoveryFailureCode;

  constructor(code: DiscoveryFailureCode, message: string) {
    super(message);
    this.code = code;
    this.name = "DiscoveryProblem";
  }
}
