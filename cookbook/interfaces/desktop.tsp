import "@typespec/json-schema";

using TypeSpec.JsonSchema;

@jsonSchema
namespace Choom.Desktop;

scalar DesktopAvailability extends boolean;

interface DesktopOperations {
  isDesktop(): DesktopAvailability;
}
