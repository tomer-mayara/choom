import { Project } from "ts-morph";

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const files = project
  .getSourceFiles()
  .filter((file) => !file.isDeclarationFile());
console.table(
  files.map((file) => ({
    file: file.getFilePath().replace(`${process.cwd()}/`, ""),
    lines: file.getEndLineNumber(),
    imports: file.getImportDeclarations().length,
    exports: file.getExportedDeclarations().size,
  })),
);
