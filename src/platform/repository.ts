import { invoke, isTauri } from "@tauri-apps/api/core";
import type { z } from "zod";
import type { RepositoryFailure, RepositoryOperations } from "./generated/contracts";
import { repositoryContracts } from "./repository-contract.ts";

export type RepositoryAccess = {
  [Name in keyof RepositoryOperations]: (
    ...args: Parameters<RepositoryOperations[Name]>
  ) => Promise<ReturnType<RepositoryOperations[Name]>>;
};

type RepositoryTransport = (command: string, args: { request: unknown }) => Promise<unknown>;

function failed(code: RepositoryFailure["code"], message: string): RepositoryFailure {
  return { status: "failure", code, message };
}

/** Validates both sides of the repository's native command boundary. */
export class DesktopRepositoryAccess implements RepositoryAccess {
  private readonly transport: RepositoryTransport;
  private readonly available: () => boolean;

  constructor(
    transport: RepositoryTransport = invoke,
    available: () => boolean = isTauri,
  ) {
    this.transport = transport;
    this.available = available;
  }

  openRepository(request: Parameters<RepositoryOperations["openRepository"]>[0]) {
    return this.call("repository_open", request, repositoryContracts.openRepository);
  }

  readRepositoryText(request: Parameters<RepositoryOperations["readRepositoryText"]>[0]) {
    return this.call("repository_read_text", request, repositoryContracts.readRepositoryText);
  }

  async resolveRepositoryPaths(request: Parameters<RepositoryOperations["resolveRepositoryPaths"]>[0]) {
    const result = await this.call("repository_resolve_paths", request, repositoryContracts.resolveRepositoryPaths);
    if (result.status === "success" && result.value.paths.length !== request.paths.length) {
      return failed("invalid-response", "Native path results do not match the requested paths.");
    }
    return result;
  }

  closeRepository(request: Parameters<RepositoryOperations["closeRepository"]>[0]) {
    return this.call("repository_close", request, repositoryContracts.closeRepository);
  }

  private async call<Request, Outcome>(
    command: string,
    request: Request,
    contract: { request: z.ZodType<Request>; outcome: z.ZodType<Outcome> },
  ): Promise<Outcome | RepositoryFailure> {
    const input = contract.request.safeParse(request);
    if (!input.success) return failed("invalid-request", "The repository request is invalid.");
    if (!this.available()) return failed("unavailable", "Repository access requires the desktop app.");

    let response: unknown;
    try {
      response = await this.transport(command, { request: input.data });
    } catch {
      return failed("unavailable", "The native repository operation could not be completed.");
    }
    const output = contract.outcome.safeParse(response);
    return output.success ? output.data : failed("invalid-response", "The native repository response is invalid.");
  }
}

export const desktopRepositoryAccess: RepositoryAccess = new DesktopRepositoryAccess();
