import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { producerSource, runHelper, toolsRoot, withScratch } from "../../support/commands.ts";

// The Stage 4 graph helper runs as a process, as the graph container runs it.
// These cases stop before the helper reads a graph profile, so they need no
// tools. The fixture approval with the checkout's tools is in local-checks.test.ts.
const helper = join(producerSource, "stage-4-graph.ts");
const usage = "Use /control/graph-profile.json or --fixture.\n";
const toolFolderRefusal = "Expected a canonical trusted tool directory.\n";
// The tool folder of the graph image is not on a computer that runs these tests.
// The name of the file operation in the Node message depends on the Node version.
const imageToolsMissing = /^ENOENT: no such file or directory, [a-z]+ '\/opt\/choom-tools'\n$/;

const usageCases = [
  { args: [] },
  { args: ["--check"] },
  { args: ["--fixture", "--fixture"] },
  { args: ["/control/graph-profile.json", "/control/graph-profile.json"] },
  { args: ["/tmp/graph-profile.json"] },
];

describe("the Stage 4 graph helper command", () => {
  test.each(usageCases)("refuses the arguments $args", ({ args }) => {
    expect(runHelper(helper, args, { CHOOM_GRAPH_TOOLS: toolsRoot })).toEqual({ status: 1, stdout: "", stderr: usage });
  });

  test("the fixture refuses a tool folder that is relative or not canonical", () => {
    withScratch((scratch) => {
      const link = join(scratch, "tools");
      symlinkSync(toolsRoot, link);
      for (const folder of ["relative/tools", link])
        expect(runHelper(helper, ["--fixture"], { CHOOM_GRAPH_TOOLS: folder }))
          .toEqual({ status: 1, stdout: "", stderr: toolFolderRefusal });
    });
  });

  test("the fixture refuses a tool folder without dependency-cruiser", () => {
    withScratch((scratch) => {
      const tools = join(scratch, "tools");
      mkdirSync(tools);
      const manifest = join(tools, "node_modules/dependency-cruiser/package.json");
      expect(runHelper(helper, ["--fixture"], { CHOOM_GRAPH_TOOLS: tools })).toEqual({ status: 1, stdout: "",
        stderr: `ENOENT: no such file or directory, lstat '${manifest}'\n` });
    });
  });

  // Only the fixture can use the tools of another folder. Without CHOOM_GRAPH_TOOLS
  // the fixture, and the graph profile run always, load the tools of the graph image.
  test("uses the tool folder of the graph image without CHOOM_GRAPH_TOOLS and for every graph profile run", () => {
    for (const result of [runHelper(helper, ["--fixture"]),
      runHelper(helper, ["/control/graph-profile.json"], { CHOOM_GRAPH_TOOLS: toolsRoot })]) {
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: "" });
      expect(result.stderr).toMatch(imageToolsMissing);
    }
  });
});
