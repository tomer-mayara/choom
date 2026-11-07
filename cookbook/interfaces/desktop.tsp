import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

scalar DesktopAvailability extends boolean;

union DirectorySelection {
  string,
  null,
}

// Operations describe logical results. The adapter keeps its synchronous
// detection and asynchronous picker behavior, including rejection.
interface DesktopOperations {
  isDesktop(): DesktopAvailability;
  selectProjectDirectory(): DirectorySelection;
}
