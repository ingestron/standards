// Rules every recipe in recipes/ follows beyond readSourceRecipe's: the editor schema accepts it
// (checked with a second validator, a differential test), and each placeholder in its text is one
// that the request fills in or one of its inputs.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { readSourceRecipe, sourceRecipeSchema } from "@ingestron/core";
import { devDependency } from "./dev-dependency.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const { parse } = await devDependency("yaml");
const { default: Ajv2020 } = await devDependency("ajv/dist/2020.js");
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(sourceRecipeSchema);

const names = readdirSync(join(repo, "recipes")).filter((name) => name.endsWith(".yaml"));
const textOf = (name) => readFileSync(join(repo, "recipes", name), "utf8");

describe("every recipe", () => {
  for (const name of names) {
    it(`${name} is accepted by readSourceRecipe and by the editor schema`, () => {
      readSourceRecipe(textOf(name), `recipes/${name}`);
      assert.ok(validate(parse(textOf(name))), JSON.stringify(validate.errors));
    });

    it(`${name} holds only placeholders the request fills in or its inputs, in its text and its defaults`, () => {
      const recipe = readSourceRecipe(textOf(name), `recipes/${name}`);
      const known = new Set(["connection", "object", "schemas", ...Object.keys(recipe.inputs)]);
      const { who, access, run, call, save, how } = recipe.ask;
      const defaults = Object.values(recipe.inputs).map((input) => input.default ?? "");
      for (const text of [who, access, run, call, save, how ?? "", ...defaults])
        for (const [, placeholder] of (text ?? "").matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g))
          assert.ok(known.has(placeholder), `{${placeholder}} is not a placeholder or an input`);
    });
  }

  it("a recipe the schema or the reader should refuse is refused by both", () => {
    const base = textOf("oracle.yaml");
    // The schema registry recipe has an input with a default.
    const registry = textOf("schema-registry.yaml");
    const broken = [
      base.replace("kind: catalog", "kind: query"),
      base.replace("save: sources/", "save: output/"),
      base.replace("id: oracle", "id: Oracle"),
      base.replace(/\nsources:[\s\S]*$/, "\nsources: []\n"),
      `${base}colour: red\n`,
      registry.replace('default: "{object}-value"', "default: [v1]"),
      registry.replace('default: "{object}-value"', 'default: "{object}-value", example: x'),
    ];
    for (const text of broken) {
      const id = /^id: (\S+)/m.exec(text)[1].toLowerCase();
      // `id: Oracle` is read as the file oracle.yaml, the one case whose id is not its name.
      assert.throws(() => readSourceRecipe(text, `recipes/${id}.yaml`));
      assert.equal(validate(parse(text)), false);
    }
  });
});
