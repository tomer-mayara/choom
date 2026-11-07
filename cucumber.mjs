const shared = {
  paths: ["cookbook/behavior/**/*.feature"],
  import: ["test/steps/**/*.ts"],
  format: ["progress"],
};

export const native = { ...shared, tags: "not @browser and not @packaged" };
export default native;
export const browser = { ...shared, tags: "@browser and not @packaged" };
export const packaged = { ...shared, tags: "@packaged" };
