import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify } from "yaml";
import { type CommandResult, runCli, toolsRoot } from "./commands.ts";
import { pathWithDoubles } from "./tool-doubles.ts";

// Helpers that run Stage 1 the way the step-1 cookbook does, on a small target
// folder. The capture needs rsync: give a PATH with the test double.
export interface StageOneRun { target: string; work: string; review: string; tools: string; env: Record<string, string> }

const stageOneSnapshotRef = "snapshot-check";

const json = (value: unknown): string => JSON.stringify(value, null, 2) + "\n";

// A target with compiler settings that use `extends`, a project reference, a
// missing base file and a file that is not valid JSON.
export const settingsTarget: Record<string, string> = {
  "app.ts": "export const value = 1;\n",
  "configs/custom.json": json({ extends: "../tsconfig.base.json", include: ["../app.ts"] }),
  "package.json": json({ name: "fixture", private: true, workspaces: ["packages/*"] }),
  "packages/lib/package.json": json({ name: "lib", main: "src/index.ts" }),
  "packages/lib/src/index.ts": "export const library = 2;\n",
  "packages/lib/tsconfig.json": json({ extends: "../../tsconfig.base.json",
    compilerOptions: { composite: true, outDir: "dist" }, include: ["src"] }),
  "tsconfig.base.json": json({ compilerOptions: { strict: true, target: "ES2022", module: "NodeNext" } }),
  "tsconfig.broken.json": "{ \"compilerOptions\": \n",
  "tsconfig.json": json({ extends: "./tsconfig.base.json", compilerOptions: { noEmit: true }, files: ["app.ts"],
    references: [{ path: "./packages/lib" }] }),
  "tsconfig.missing.json": json({ extends: "./tsconfig.absent.json" }),
};

// A target with JavaScript and TypeScript files and a package manifest, and no
// tsconfig*.json or jsconfig*.json file.
export const noSettingsTarget: Record<string, string> = {
  "package.json": json({ name: "fixture", private: true, type: "module" }),
  "src/app.ts": "import { greet } from './greet.js';\n\nexport const message: string = greet('Choom');\n",
  "src/greet.js": "export function greet(name) {\n  return 'Hello ' + name;\n}\n",
};

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

export function stageOneRun(scratch: string, env: Record<string, string>, tools = toolsRoot,
  target = settingsTarget): StageOneRun {
  const run = { target: join(scratch, "target"), work: join(scratch, "run"), review: join(scratch, "review"), tools,
    env: { CHOOM_TOOLS: tools, CHOOM_WORK: join(scratch, "run"), CHOOM_TARGET: join(scratch, "target"),
      CHOOM_RUN_ID: "run-check", CHOOM_SNAPSHOT_ID: stageOneSnapshotRef, CHOOM_BASELINE_ID: "baseline-check", ...env } };
  writeFiles(run.target, target);
  return run;
}

export function stageOne(run: StageOneRun, action: string, ...args: string[]): CommandResult {
  return runCli(["stage-1", action, ...args], run.env, run.tools);
}

export interface Excerpt { id: string; artifactRef: string; snapshotRef: string; path: string; sha256: string; lines: number[] }
type Fields = Record<string, unknown>;

function checked(result: CommandResult, action: string): CommandResult {
  if (result.status !== 0) throw new Error(`Stage 1 ${action} failed: ${result.stderr}`);
  return result;
}

// A Stage 1 run of the target before start. Its capture uses the rsync test double.
export function newStageOneRun(scratch: string, target = settingsTarget): StageOneRun {
  return stageOneRun(scratch, { PATH: pathWithDoubles(scratch) }, toolsRoot, target);
}

// Starts the run and captures its target.
export function startAndCapture(run: StageOneRun): StageOneRun {
  for (const action of ["start", "capture"]) checked(stageOne(run, action), action);
  return run;
}

// A Stage 1 run of the target after start and capture.
export function capturedRun(scratch: string, target = settingsTarget): StageOneRun {
  return startAndCapture(newStageOneRun(scratch, target));
}

// Collects the settings of a captured run and saves one excerpt of package.json.
export function settingsAndExcerpt(run: StageOneRun): { run: StageOneRun; excerpt: Excerpt } {
  checked(stageOne(run, "settings"), "settings");
  const excerpt = checked(stageOne(run, "excerpt", "package.json", "1", "5", "Check the workspace patterns."), "excerpt");
  return { run, excerpt: JSON.parse(excerpt.stdout) as Excerpt };
}

// A Stage 1 run of the target after start, capture and settings, with one saved
// excerpt of package.json.
export function capturedStageOneRun(scratch: string, target = settingsTarget): { run: StageOneRun; excerpt: Excerpt } {
  return settingsAndExcerpt(capturedRun(scratch, target));
}
export interface ReviewPacket { review: Fields; scope: Fields; call: Fields; prompt: string; response?: string }

// A complete Stage 1 review packet that cites one saved excerpt. A test can
// change any part before it writes the packet.
export function reviewPacket(excerpt: Excerpt): ReviewPacket {
  const source = { id: excerpt.id, snapshotRef: excerpt.snapshotRef, path: excerpt.path, sha256: excerpt.sha256,
    lines: excerpt.lines };
  return {
    review: { formatVersion: 1, snapshotRef: stageOneSnapshotRef, reviewedFiles: [source],
      roles: [{ selector: "app.ts", roles: ["source"], basis: "observed", evidenceRefs: ["inventory-001"],
        useReview: { unitScope: "unknown", basis: "partial-review", uses: [], evidenceRefs: ["inventory-001"],
          limits: ["Only file purpose was inspected."] } }],
      workspaceDeclarations: [{ path: "package.json", patterns: ["packages/*"], membershipStatus: "unverified",
        evidenceRefs: [excerpt.id] }],
      questions: [{ id: "s1-question-001", subjectRefs: ["app.ts"], text: "Which command starts the application?",
        evidenceRefs: ["inventory-001#/files/0"] }],
      gaps: [{ id: "s1-gap-001", kind: "missing-input", subjectRefs: ["tsconfig.missing.json"],
        reason: "The base configuration is not in the snapshot.", evidenceRefs: ["settings-001#/configs"] }],
      llmReview: "recorded" },
    scope: { formatVersion: 1, runRef: "run-check", snapshotRef: stageOneSnapshotRef,
      suppliedArtifactRefs: ["inventory-001", "settings-001", "exclusions-001", "scope-notes-001", "extra-configs-001",
        excerpt.artifactRef], limits: ["Only the saved test fixture was supplied."] },
    call: { provider: "unknown", model: "unknown", date: "unknown", settings: "unknown", hiddenReasoning: "not-saved" },
    prompt: "Perform Choom Appendix A, stage 1.\n",
  };
}

export function writeReview(run: StageOneRun, packet: ReviewPacket, folder = run.review): string {
  const review = stringify(packet.review);
  writeFiles(folder, {
    "review.yaml": review,
    "review-scope.json": json(packet.scope),
    "llm-prompt.md": packet.prompt,
    "llm-response.md": packet.response ?? "The complete review follows.\n\n" + review,
    "llm-call.yaml": stringify(packet.call),
  });
  return folder;
}
