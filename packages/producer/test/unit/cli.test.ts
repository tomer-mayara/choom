import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { helperCall, producerCommands, usage } from "../../src/cli.ts";
import { producerSource } from "../support/commands.ts";

describe("producer command line mapping", () => {
  test("names the commands that operators run from the tool checkout", () => {
    expect([...producerCommands].map(([name, { helper }]) => [name, helper])).toEqual([
      ["stage-1", "stage-1-commands.ts"],
      ["stage-2", "stage-2-commands.ts"],
      ["stage-2-consolidate", "stage-2-consolidate-inputs.ts"],
      ["stage-3", "stage-3-commands.ts"],
      ["stage-3-finish", "stage-3-finish.ts"],
      ["stage-4", "stage-4-commands.ts"],
      ["stage-4-inspect", "stage-4-inspect.ts"],
      ["stage-4-5-publish", "stage-4-5-publish.ts"],
      ["stage-5", "stage-5-commands.ts"],
      ["stage-6", "stage-6-commands.mjs"],
      ["baseline", "baseline-commands.ts"],
      ["duplication", "duplication-commands.mjs"],
      ["recover-capture", "recover-capture.ts"],
      ["inventory-view", "inventory-view.py"],
    ]);
  });

  test.each([...producerCommands])("%s runs its helper with the remaining arguments unchanged", (name, { helper }) => {
    const path = join(producerSource, helper);
    expect(existsSync(path)).toBe(true);
    expect(helperCall([name, "action", "--flag", "two words"], "/usr/bin/node")).toEqual({
      program: helper.endsWith(".py") ? "python3" : "/usr/bin/node",
      args: [path, "action", "--flag", "two words"],
    });
  });

  test("runs JavaScript helpers with the Node that runs the command line", () => {
    expect(helperCall(["stage-6", "verify"])?.program).toBe(process.execPath);
  });

  test.each([[[]], [["unknown"]], [["constructor"]], [["__proto__"]], [["STAGE-1"]], [["stage-1-commands.ts"]],
    [["stage-3-finish.ts"]], [["producer-code"]]])("has no helper for %p", (argv: string[]) => {
    expect(helperCall(argv)).toBeUndefined();
  });

  test("lists every command and its helper in the usage", () => {
    const text = usage();
    expect(text).toStartWith("Usage: producer <command> [action] [arguments...]\n");
    for (const [name, { helper }] of producerCommands)
      expect(text).toMatch(new RegExp(`^ {2}${name} +.+ \\(${helper.replaceAll(".", "\\.")}\\)$`, "m"));
  });

  test("says that the Stage 4 inspection helper also finds references", () => {
    expect(producerCommands.get("stage-4-inspect")?.use).toBe("Collect the Stage 4 source evidence, excerpts and references.");
  });
});
