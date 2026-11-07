import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App.tsx";
import { createWorkspace } from "../../src/architecture/workspace.ts";
import { layoutArchitectureDocument } from "../../src/lib/architecture-layout.ts";
import "../../src/styles.css";

declare global {
  var __choomLayoutControl: (phase: "before" | "completed", name: string) => Promise<"continue" | "fail">;
}

const controlledLayout: typeof layoutArchitectureDocument = async (document) => {
  const action = await globalThis.__choomLayoutControl("before", document.name);
  if (action === "fail") throw new Error("The acceptance layout dependency failed.");
  const layout = await layoutArchitectureDocument(document);
  await globalThis.__choomLayoutControl("completed", document.name);
  return layout;
};

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

createRoot(root).render(
  <StrictMode>
    <App workspace={createWorkspace({ layout: controlledLayout })} />
  </StrictMode>,
);
