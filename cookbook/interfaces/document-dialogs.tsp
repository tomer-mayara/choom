import "@typespec/json-schema";
import "./desktop.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

union DiagramFileSelection {
  string,
  null,
}

@extension("additionalProperties", false)
model DiagramDestinationRequest {
  // Runtime requires a portable literal basename of at most 255 UTF-8 bytes:
  // no controls, path separators, Windows metacharacters/device names, or trailing dot/space.
  @minLength(1)
  @maxLength(255)
  fileName: string;
}

// Promise bindings preserve picker rejection. Browser absence returns null/false.
// A selected save path alone does not authorize replacing a file that appears later.
interface DiagramDialogOperations {
  selectDiagramFile(): DiagramFileSelection;
  selectDiagramDestination(
    request: DiagramDestinationRequest,
  ): DiagramFileSelection;
  confirmDiagramReplacement(): boolean;
}
