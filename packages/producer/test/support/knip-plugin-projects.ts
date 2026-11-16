import { entryPlan, type JsonRecord } from "./stage-2-attempt.ts";
import type { SnapshotFile } from "./staged-run.ts";

// Two small frontend projects for the Knip plugin patterns of the Stage 2 profile.
// Each holds app.ts, the entry that the package main field names, because the
// Stage 2 and Stage 3 helpers of the tests plan and review that file.
export interface KnipProject {
  snapshot: SnapshotFile[];
  // The Stage 2 entry plan of an attempt: the root workspace with app.ts as its entry.
  plan(id: string): JsonRecord;
}

// The probe settings file reports on stderr and leaves this marker file when a tool runs it.
export const probeMessage = "choom-probe: vite.config.js ran";
export const probeMarker = "vite-config.ran";

const app: SnapshotFile = { path: "app.ts", text: "export const value = 1;\n" };
const manifest = (fields: JsonRecord): SnapshotFile => ({ path: "package.json",
  text: JSON.stringify({ name: "storefront", private: true, main: "app.ts", ...fields }, null, 2) + "\n" });
const rootWorkspace = (project: string): (id: string) => JsonRecord => (id) =>
  entryPlan(id, { workspaces: [{ dir: ".", entry: ["app.ts!"], project: [project] }] });

// A Next.js app. Its page file follows the naming pattern of the Next.js app folder,
// and nothing imports it.
export const nextPage = "app/page.tsx";
export const nextProject: KnipProject = {
  snapshot: [app, manifest({ dependencies: { next: "16.0.0", react: "19.0.0" } }),
    { path: nextPage, text: "export default function Page() {\n  return null;\n}\n" }],
  plan: rootWorkspace("**/*.{ts,tsx}!"),
};

// A Vite app whose settings file is a script that writes to stderr and to a file
// when it runs. It names one entry as a string literal and computes the other.
export const settingsEntry = "src/only-in-settings.ts";
export const computedEntry = "src/admin.ts";
export const viteProject: KnipProject = {
  snapshot: [app, manifest({ type: "module", devDependencies: { vite: "8.0.0" } }),
    { path: "vite.config.js", text: "import { writeFileSync } from 'node:fs';\n\n" +
      "// A probe: when a tool runs this file, it reports it on stderr and leaves a marker file.\n" +
      `console.error('${probeMessage}');\ntry {\n  writeFileSync(new URL('./${probeMarker}', import.meta.url), 'ran');\n` +
      "} catch {\n  // The folder can be read-only, as the input of the Knip container is.\n}\n\n" +
      "export default {\n  build: {\n    rollupOptions: {\n" +
      `      input: { main: '${settingsEntry}', admin: 'src/' + 'admin.ts' },\n    },\n  },\n};\n` },
    { path: settingsEntry, text: "console.log('main');\n" },
    { path: computedEntry, text: "console.log('admin');\n" }],
  plan: rootWorkspace("**/*.{js,ts}!"),
};
