import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.tsx";
import { createWorkspace } from "../../src/architecture/workspace.ts";
import { layoutBaseline } from "../../src/lib/architecture-layout.ts";
import "../../src/styles.css";

declare global {
  var __choomLayoutControl: (phase: "before" | "completed", name: string) => Promise<"continue" | "fail">;
}

const controlledLayout: typeof layoutBaseline = async (baseline) => {
  const action = await globalThis.__choomLayoutControl("before", baseline.id);
  if (action === "fail") throw new Error("The acceptance layout dependency failed.");
  const layout = await layoutBaseline(baseline);
  await globalThis.__choomLayoutControl("completed", baseline.id);
  return layout;
};

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <App workspace={createWorkspace({ layout: controlledLayout })} />
  </StrictMode>,
);
