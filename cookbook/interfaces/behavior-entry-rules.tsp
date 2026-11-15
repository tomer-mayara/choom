import "@typespec/json-schema";

using TypeSpec.JsonSchema;

// The pinned list of Choom behavior entry rules. The producer keeps it as one YAML
// file, packages/producer/rules/behavior-entry-rules.yaml. Stage 4 start saves a
// copy and its SHA-256, and Stage 4 collect applies the rules to the source files
// of the graph scope. A match is a candidate to inspect, not a proven entry.
// Runtime validation also refuses a repeated rule ID and a call rule that names
// one argument as both the name and the handler.
@jsonSchema
namespace Choom.Producer;

// Lowercase letters and digits in words that single hyphens join, such as express-route-get.
@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@maxLength(128)
scalar behaviorEntryRuleId extends string;

// A rule that changes keeps its ID and gets the next version.
@minValue(1)
@maxValue(1000000)
scalar behaviorEntryRuleVersion extends integer;

// Text that is not blank, such as the library name express.
@pattern("\\S")
@maxLength(200)
scalar behaviorEntryText extends string;

// The kind of entry that a rule finds, such as http-route or worker.
@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@maxLength(64)
scalar behaviorEntryKind extends string;

// The module name that an import or a require call gives: a package name with an
// optional subpath, such as express or @hono/node-server, or a Node module name
// such as node:worker_threads. A relative name is not a library.
@pattern("^(?:node:)?(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*(?:/[a-z0-9._~-]+)*$")
scalar behaviorEntryModuleName extends string;

// The callee of the call that the rule finds, written as JavaScript that starts
// with a name of the import: importName itself for the value of the module (its
// default export, its export = value or what require gives), or else the name of
// an export of the module. Each () is a call and each .name a property. The path
// ends with a name. With new at the start, the first () is a new call; when the
// path has no (), the rule finds the new call of the path itself. Examples:
// express().get finds app.get(...) after const app = express(); Router().get
// finds router.get(...) after const router = Router(); new Worker finds
// new Worker(...).
@pattern("^(?:new )?[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\\(\\))*\\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
scalar behaviorEntryCallPath extends string;

// The zero-based position of an argument of the call that the rule finds.
@minValue(0)
@maxValue(255)
scalar behaviorEntryArgument extends integer;

// A glob of snapshot-relative paths, as picomatch matches it with dot files, such
// as **/vite.config.{js,ts}. It does not start with / and has no space or backslash.
@pattern("^[^/\\s\\\\][^\\s\\\\]*$")
@maxLength(200)
scalar behaviorEntryFileGlob extends string;

// Property names that dots join, such as build.rollupOptions.input.
@pattern("^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
@maxLength(200)
scalar behaviorEntryPropertyPath extends string;

// A rule that finds a call whose callee is callPath. The name and the handler are
// arguments of that call: a position, last for the last argument, or null for none.
// A call that does not have the arguments that the rule names is not a match.
@extension("additionalProperties", false)
model BehaviorEntryCallRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "call";
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  nameArgument: behaviorEntryArgument | null;
  handlerArgument: behaviorEntryArgument | "last" | null;
}

// A rule that reads the literal value at a property path of the settings object
// of a source file that matches fileGlob, without running the file. A value that
// is not a literal is a gap.
@extension("additionalProperties", false)
model BehaviorEntrySettingsLiteralRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "settings-literal";
  fileGlob: behaviorEntryFileGlob;
  propertyPath: behaviorEntryPropertyPath;
}

union BehaviorEntryRule {
  BehaviorEntryCallRule,
  BehaviorEntrySettingsLiteralRule,
}

@extension("additionalProperties", false)
model BehaviorEntryRuleList {
  formatVersion: 1;

  @minItems(1)
  rules: BehaviorEntryRule[];
}
