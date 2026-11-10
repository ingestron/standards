// Trims the bundle schema `databricks bundle schema` prints to what the tests need: it
// removes the descriptions, and leaves open the three definitions of model serving
// providers, which no kit uses, so any value passes there. Every other rule stays as printed.
// Usage: databricks bundle schema | node scripts/trim-bundle-schema.mjs > bundle-schema.json
// test/kits.test.mjs runs it on the installed Databricks CLI's schema; nothing stores the result.
import { readFileSync } from "node:fs";

const annotations = new Set([
  "description",
  "markdownDescription",
  "deprecationMessage",
  "enumDescriptions",
]);
const open = [
  "catalog.ModelProviderServiceConfig",
  "serving.AmazonBedrockConfigBedrockProvider",
  "serving.ExternalModelProvider",
];

/** The schema without annotations; a key named like one under `properties` is a property, and stays. */
function trimmed(node, parent) {
  if (Array.isArray(node)) return node.map((item) => trimmed(item));
  if (node === null || typeof node !== "object") return node;
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => parent === "properties" || !annotations.has(key))
      .map(([key, value]) => [
        key,
        open.includes(key) ? {} : trimmed(value, key),
      ]),
  );
}

const schema = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(`${JSON.stringify(trimmed(schema), null, 2)}\n`);
