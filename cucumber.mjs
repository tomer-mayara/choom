const shared = {
  paths: ["cookbook/behavior/**/*.feature"],
  import: ["test/steps/**/*.ts"],
  format: ["progress"],
};

export default { ...shared, tags: "not @browser" };
export const browser = { ...shared, tags: "@browser" };
