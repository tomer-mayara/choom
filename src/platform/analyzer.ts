import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import type { z } from "zod";
import type { DepCruiserNativeFailure, DepCruiserNativeProgress, DepCruiserOperations } from "./generated/contracts.ts";
import { analyzerContracts } from "./analyzer-contract.ts";

type Operation<Name extends keyof DepCruiserOperations> = (
  ...args: Parameters<DepCruiserOperations[Name]>
) => Promise<ReturnType<DepCruiserOperations[Name]>>;

export interface AnalyzerAccess {
  prepareDepCruiser: Operation<"prepareDepCruiser">;
  runDepCruiser(
    request: Parameters<DepCruiserOperations["runDepCruiser"]>[0],
    onProgress?: (progress: DepCruiserNativeProgress) => void,
  ): Promise<ReturnType<DepCruiserOperations["runDepCruiser"]>>;
  cancelDepCruiser: Operation<"cancelDepCruiser">;
  releaseDepCruiser: Operation<"releaseDepCruiser">;
}

type Transport = (command: string, args: { request: unknown; onProgress?: unknown }) => Promise<unknown>;
type ChannelFactory = (onMessage: (message: unknown) => void) => unknown;

function failed(code: DepCruiserNativeFailure["code"], stage: DepCruiserNativeFailure["stage"], message: string): DepCruiserNativeFailure {
  return { status: "failure", stage, code, message, durationMs: 0 };
}

function progressChannel(onMessage: (message: unknown) => void): unknown {
  const channel = new Channel<unknown>();
  channel.onmessage = onMessage;
  return channel;
}

/** Validates the product-specific native analyzer operations and progress channel. */
export class DesktopAnalyzerAccess implements AnalyzerAccess {
  private readonly transport: Transport;
  private readonly available: () => boolean;
  private readonly createChannel: ChannelFactory;

  constructor(transport: Transport = invoke, available: () => boolean = isTauri, createChannel: ChannelFactory = progressChannel) {
    this.transport = transport;
    this.available = available;
    this.createChannel = createChannel;
  }

  prepareDepCruiser(request: Parameters<DepCruiserOperations["prepareDepCruiser"]>[0]) {
    return this.call("depcruiser_prepare", request, analyzerContracts.prepareDepCruiser, "setup");
  }

  async runDepCruiser(request: Parameters<DepCruiserOperations["runDepCruiser"]>[0], onProgress: (progress: DepCruiserNativeProgress) => void = () => {}) {
    const input = analyzerContracts.runDepCruiser.request.safeParse(request);
    if (!input.success) return failed("invalid-request", "analysis", "The analysis job request is invalid.");
    if (!this.available()) return failed("unavailable", "setup", "Analyzer execution requires the desktop app.");
    let invalidProgress = false;
    let elapsed = 0;
    let acceptingProgress = true;
    const receive = (message: unknown) => {
      if (!acceptingProgress) return;
      const parsed = analyzerContracts.progress.safeParse(message);
      if (!parsed.success || parsed.data.jobId !== input.data.jobId || parsed.data.elapsedMs < elapsed) { invalidProgress = true; return; }
      elapsed = parsed.data.elapsedMs;
      try { onProgress(parsed.data); } catch { /* Observers cannot interrupt native cleanup. */ }
    };
    let result;
    try {
      result = await this.call("depcruiser_run", input.data, analyzerContracts.runDepCruiser, "analysis", this.createChannel(receive));
    } catch {
      result = failed("unavailable", "analysis", "The native analysis operation could not be completed.");
    } finally { acceptingProgress = false; }
    if (result.status === "failure" && result.stage === "cleanup") return result;
    return invalidProgress ? failed("invalid-response", "analysis", "Native analysis progress was invalid.") : result;
  }

  cancelDepCruiser(request: Parameters<DepCruiserOperations["cancelDepCruiser"]>[0]) {
    return this.call("depcruiser_cancel", request, analyzerContracts.cancelDepCruiser, "cleanup");
  }

  releaseDepCruiser(request: Parameters<DepCruiserOperations["releaseDepCruiser"]>[0]) {
    return this.call("depcruiser_release", request, analyzerContracts.releaseDepCruiser, "cleanup");
  }

  private async call<Request, Outcome>(
    command: string, request: Request, contract: { request: z.ZodType<Request>; outcome: z.ZodType<Outcome> },
    stage: DepCruiserNativeFailure["stage"], onProgress?: unknown,
  ): Promise<Outcome | DepCruiserNativeFailure> {
    const input = contract.request.safeParse(request);
    if (!input.success) return failed("invalid-request", stage, "The native analysis request is invalid.");
    if (!this.available()) return failed("unavailable", "setup", "Analyzer execution requires the desktop app.");
    let response: unknown;
    try {
      response = await this.transport(command, { request: input.data, ...(onProgress === undefined ? {} : { onProgress }) });
    } catch {
      return failed("unavailable", stage, "The native analysis operation could not be completed.");
    }
    const output = contract.outcome.safeParse(response);
    return output.success ? output.data : failed("invalid-response", stage, "The native analysis response is invalid.");
  }
}
