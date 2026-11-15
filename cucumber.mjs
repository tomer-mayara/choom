const shared = {
  paths: ["cookbook/behavior/**/*.feature"],
  import: ["test/steps/**/*.ts"],
  format: ["progress"],
};

// Scenarios tagged @docker need a Docker engine. Only the docker profile runs them.
export const native = { ...shared, tags: "not @browser and not @packaged and not @docker" };
export default native;
export const browser = { ...shared, tags: "@browser and not @packaged and not @docker" };
export const packaged = { ...shared, tags: "@packaged" };
export const docker = { ...shared, tags: "@docker" };
