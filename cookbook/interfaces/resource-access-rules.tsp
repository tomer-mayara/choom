import "@typespec/json-schema";
import "./behavior-entry-rules.tsp";

using TypeSpec.JsonSchema;

// The pinned list of Choom resource access rules. The producer keeps it as one YAML
// file, packages/producer/rules/resource-access-rules.yaml. Stage 4 start saves a
// copy and its SHA-256, and Stage 4 collect applies the rules to the source files
// of the graph scope. A match is a site to inspect: the name of the resource does
// not prove which resource the code uses, and the rule names no owner. The fields
// that both rule lists share use the scalars of the behavior entry rule list.
// Runtime validation also refuses a repeated rule ID, a name call that the call path
// or the type path does not have, and a type path that does not end with the last
// steps of the call path.
@jsonSchema
namespace Choom.Producer;

// The kind of resource that a rule finds, such as database-table or file.
@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@maxLength(64)
scalar resourceAccessKind extends string;

// What the call does to the resource, such as read or write.
@pattern("^[a-z0-9]+(?:-[a-z0-9]+)*$")
@maxLength(64)
scalar resourceAccessOperation extends string;

// The call path written from a type that the import exports: the type name, or
// importName itself for the type of the value of the module, then the last steps
// of callPath. A value whose declared type is that type, such as a parameter
// db: Knex, stands for the value of the steps of callPath before them. Examples:
// Knex().insert for knex()().insert, and Pool.query for new Pool().query.
@pattern("^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\\(\\))*\\.[A-Za-z_$][A-Za-z0-9_$]*)*$")
scalar resourceAccessTypePath extends string;

// The call that holds the name, counted back from the call that the rule finds:
// 0 for that call, 1 for the last call of the call path, 2 for the call before it.
@minValue(0)
@maxValue(255)
scalar resourceAccessCall extends integer;

// A rule that finds a call whose callee is callPath on the value of importName, or
// typePath on a value whose declared type the import gives. The name of the resource
// is the argument at nameArgument of the call at nameCall, such as the table name
// invoices of db('invoices').insert(row).
@extension("additionalProperties", false)
model ResourceAccessRule {
  id: behaviorEntryRuleId;
  version: behaviorEntryRuleVersion;
  library: behaviorEntryText;
  resourceKind: resourceAccessKind;
  operation: resourceAccessOperation;
  importName: behaviorEntryModuleName;
  callPath: behaviorEntryCallPath;
  typePath: resourceAccessTypePath | null;
  nameCall: resourceAccessCall;
  nameArgument: behaviorEntryArgument;
}

@extension("additionalProperties", false)
model ResourceAccessRuleList {
  formatVersion: 1;

  @minItems(1)
  rules: ResourceAccessRule[];
}
