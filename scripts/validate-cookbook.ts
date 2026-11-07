import { fileURLToPath } from "node:url";
import { validateComponents } from "./validate-components";

try {
  await validateComponents(fileURLToPath(new URL("..", import.meta.url)));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
