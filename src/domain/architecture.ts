import { z } from "zod";
import type { Architecture as ArchitectureContract } from "./generated/contracts";

const identifier = z.string().min(1);

export const architectureSchema = z
  .object({
    name: z.string().min(1),
    nodes: z
      .array(z.object({ id: identifier, label: z.string().min(1) }))
      .min(1),
    edges: z.array(
      z.object({ id: identifier, source: identifier, target: identifier }),
    ),
  })
  .superRefine((model, context) => {
    const ids = new Set(model.nodes.map((node) => node.id));
    if (ids.size !== model.nodes.length) {
      context.addIssue({
        code: "custom",
        path: ["nodes"],
        message: "Node IDs must be unique",
      });
    }
    if (
      new Set(model.edges.map((edge) => edge.id)).size !== model.edges.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["edges"],
        message: "Edge IDs must be unique",
      });
    }
    model.edges.forEach((edge, index) => {
      if (!ids.has(edge.source) || !ids.has(edge.target)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index],
          message: "Edges must reference existing nodes",
        });
      }
    });
  });

export type Architecture = ArchitectureContract;

export const starterArchitecture: Architecture = architectureSchema.parse({
  name: "Choom starter",
  nodes: [
    { id: "ui", label: "React interface" },
    { id: "domain", label: "Architecture model" },
    { id: "desktop", label: "Tauri desktop" },
  ],
  edges: [
    { id: "ui-domain", source: "ui", target: "domain" },
    { id: "ui-desktop", source: "ui", target: "desktop" },
  ],
});
