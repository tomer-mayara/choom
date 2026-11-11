import "@typespec/json-schema";
import "./desktop.tsp";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

union BaselineFileSelection {
  string,
  null,
}

// Promise bindings preserve picker rejection. Browser absence returns null.
interface BaselineDialogOperations {
  selectBaselineFile(): BaselineFileSelection;
}
