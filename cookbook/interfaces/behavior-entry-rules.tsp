import "@typespec/json-schema";

using TypeSpec.JsonSchema;

// The pinned list of Choom behavior entry rules. The producer keeps it as one YAML
// file, packages/producer/rules/behavior-entry-rules.yaml. Stage 4 start saves a
// copy and its SHA-256, and Stage 4 collect applies the rules to the source files
// of the graph scope and to the package.json files of the snapshot. A match is a
// candidate to inspect, not a proven entry. Runtime validation also refuses a
// repeated rule ID, a call rule that names one argument of one call as both the
// name and the handler, a name call that the call path does not have or that names
// no name argument, and a call path that calls a method of its sameValueMethods.
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

// The call that holds the name, counted back from the call that the rule finds:
// 0 for that call, 1 for the last call of the call path, 2 for the call before it.
@minValue(0)
@maxValue(255)
scalar behaviorEntryNameCall extends integer;

// The name of a method, such as description.
@pattern("^[A-Za-z_$][A-Za-z0-9_$]*$")
@maxLength(128)
scalar behaviorEntryMethodName extends string;

// A glob of snapshot-relative paths, as picomatch matches it with dot files, such
// as **/vite.config.{js,ts}. It does not start with / and has no space or backslash.
@pattern("^[^/\\s\\\\][^\\s\\\\]*$")
@maxLength(200)
scalar behaviorEntryFileGlob extends string;

// Property names that dots join, such as build.rollupOptions.input.
@pattern("^[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
@maxLength(200)
scalar behaviorEntryPropertyPath extends string;

// A rule that finds a call whose callee is callPath. The handler is an argument of
// that call: a position, last for the last argument, or null for none. The name is
// the argument at nameArgument, or null for none, of the call at nameCall. A call
// that does not have the arguments that the rule names is not a match.
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

  // The call whose argument is the name, such as 1 for the command call of
  // program.command('serve').action(serve), which the rule program.command().action
  // finds. Without nameCall, the name is an argument of the call that the rule finds.
  nameCall?: behaviorEntryNameCall;

  // The methods whose call gives the value that it is called on, such as the builder
  // methods of a command. A call of such a method does not change the value, so the
  // rule also finds its call path with these calls in it: program.command().action
  // with description also finds program.command('serve').description('Start').action(serve).
  @minItems(1)
  @uniqueItems
  sameValueMethods?: behaviorEntryMethodName[];
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

// A rule that reads the bin field of each package.json of the snapshot, outside the
// node_modules folders, without running anything. Each command that the field names
// is a candidate. Its handler is the source file that the command runs only with
// evidence: the snapshot holds the bin file, or a saved compiler setting compiles a
// source file of the snapshot to it. Otherwise the handler is null with a reason.
@extension("additionalProperties", false)
model BehaviorEntryPackageBinRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  entryKind: behaviorEntryKind;
  kind: "package-bin";
}

union BehaviorEntryRule {
  BehaviorEntryCallRule,
  BehaviorEntrySettingsLiteralRule,
  BehaviorEntryPackageBinRule,
}

@extension("additionalProperties", false)
model BehaviorEntryRuleList {
  formatVersion: 1;

  @minItems(1)
  rules: BehaviorEntryRule[];
}
