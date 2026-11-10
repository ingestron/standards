// Checks kits. For each kit folder (all of them when none is named):
//   1. readKit accepts it;
//   2. the real CLI plans it, with no error;
//   3. that plan has no warning but REPLACE_ME, the values a kit leaves for its user
//      (so a `features: ga` kit has no PREVIEW_FEATURE, and no kit has NOT_APPLIED), and its
//      platform.yaml accepts no warning, which would hide one from this check;
//   4. its README names every intent section its standard writes, in backticks (`load`);
//   5. when its tag `<id>@<version>` exists, nothing in it changed since.
// Usage, from the repository's root folder: node scripts/check-kits.mjs [<kit folder>...]
// INGESTRON_CLI is the path of the CLI's JavaScript file; by default, the
// `bin.ingestron` of the installed @ingestron/cli.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { changedSince, chosenFolders, kitIn, shown, tagCommit, tagOf } from "./kits.mjs";

/** The intent sections a standard can write, in the model's words. */
const INTENT_SECTIONS = [
  "load",
  "history",
  "sequence",
  "audit",
  "rescued",
  "retention",
  "storage",
  "quality",
  "operations",
  "cleanse",
  "governance",
];
/** Blocks whose keys are intent too: a layer's duties, and what no layer may change. */
const INTENT_BLOCKS = ["layers", "fixed"];

/** The path of the CLI's JavaScript file, or throws a plain `Error` saying what to set. */
export function cliPath() {
  if (process.env.INGESTRON_CLI) return process.env.INGESTRON_CLI;
  const folder = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "node_modules",
    "@ingestron",
    "cli",
  );
  const manifest = join(folder, "package.json");
  if (!existsSync(manifest))
    throw new Error("The CLI is not installed. Run npm ci, or set INGESTRON_CLI to its main.js.");
  return join(folder, JSON.parse(readFileSync(manifest, "utf8")).bin.ingestron);
}

/**
 * The diagnostics in the text `ingestron plan` prints. Each starts a block
 * with a line `<place>  <severity>  <CODE>`; the lines under it explain.
 */
export function diagnosticsIn(text) {
  const pattern = /^(\S.*?)  (error|warning)  ([A-Z][A-Z0-9_]*)$/;
  return text.split("\n").flatMap((line) => {
    const match = pattern.exec(line);
    return match ? [{ place: match[1], severity: match[2], code: match[3] }] : [];
  });
}

/** The warning a kit may have: a value it leaves for its user to write. */
const ALLOWED_WARNINGS = new Set(["REPLACE_ME"]);

/**
 * The problems from planning a copy of the kit with the CLI: each error, and each warning but
 * REPLACE_ME. None when the plan is clean.
 */
function planProblems(folder) {
  let cli;
  try {
    cli = cliPath();
  } catch (error) {
    return [error.message];
  }
  if (!existsSync(cli)) return [`The CLI file ${cli} does not exist; set INGESTRON_CLI.`];
  const copy = mkdtempSync(join(tmpdir(), "kit-check-"));
  try {
    cpSync(folder, copy, { recursive: true });
    const args = [cli, "plan", "--definitions", copy, "--out", join(copy, "build"), "--no-diff"];
    const run = spawnSync("node", args, { cwd: copy, encoding: "utf8" });
    const found = diagnosticsIn(run.stdout ?? "");
    const problems = found
      .filter((item) => item.severity === "error" || !ALLOWED_WARNINGS.has(item.code))
      .map((item) => `ingestron plan reports ${item.severity} ${item.code} at ${item.place}`);
    if (run.status !== 0 && problems.length === 0)
      problems.push(
        `ingestron plan failed (exit ${run.status}): ${`${run.stdout}${run.stderr}`.trim()}`,
      );
    return problems;
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

/** The problem when the kit's platform.yaml has an `accept` list, which would hide warnings. */
export function acceptProblems(folder) {
  const path = join(folder, "platform.yaml");
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").replace(/(^|\s)#.*$/gm, "");
  return /^accept\s*:/m.test(text)
    ? [
        "platform.yaml has accept entries. A kit accepts no warning: change the kit so the plan reports none.",
      ]
    : [];
}

/** The intent sections the standard's text writes, at its top level or in a layer or `fixed`. */
export function sectionsWritten(standardText) {
  const text = standardText.replace(/(^|\s)#.*$/gm, "");
  const key = (name) => new RegExp(`(^|[\\s{,])${name}\\s*:`);
  const topLevel = (name) => new RegExp(`^${name}\\s*:`, "m").test(text);
  const blocks = INTENT_BLOCKS.map(
    (block) => text.match(new RegExp(`^${block}\\s*:(?:.*\\n(?![A-Za-z]))*.*`, "m"))?.[0] ?? "",
  );
  return INTENT_SECTIONS.filter(
    (name) => topLevel(name) || blocks.some((block) => key(name).test(block)),
  );
}

/** The problem with the README, if it leaves out a section the standard writes. */
function readmeProblems(folder) {
  const written = sectionsWritten(readFileSync(join(folder, "standard.yaml"), "utf8"));
  const readme = readFileSync(join(folder, "README.md"), "utf8");
  const missing = written.filter((name) => !readme.includes(`\`${name}\``));
  return missing.length === 0
    ? []
    : [`README.md does not name in backticks: ${missing.join(", ")}`];
}

/** The problem when a tagged kit has changed since its tag. */
function tagProblems(repo, kit) {
  const tag = tagOf(kit);
  if (tagCommit(repo, tag) === null) return [];
  const changed = changedSince(repo, tag, kit.folder);
  if (changed.length === 0) return [];
  return [
    `changed since the tag ${tag}: ${changed.join(", ")}. A published kit never changes; make a new version.`,
  ];
}

/** Every problem with one kit folder; `name` is how it is shown. */
export function kitProblems(repo, folder) {
  let kit;
  try {
    kit = kitIn(repo, folder);
  } catch (error) {
    return { name: shown(repo, folder), problems: [error.message] };
  }
  const problems = [
    ...planProblems(folder),
    ...acceptProblems(folder),
    ...readmeProblems(folder),
    ...tagProblems(repo, kit),
  ];
  return { name: `${shown(repo, folder)} (${tagOf(kit)})`, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repo = process.cwd();
  const { folders, problems: stray } = chosenFolders(repo, process.argv.slice(2));
  let failed = stray.length;
  for (const line of stray) console.log(`FAIL  ${line}`);
  for (const folder of folders) {
    const { name, problems } = kitProblems(repo, folder);
    console.log(`${problems.length === 0 ? "ok  " : "FAIL"}  ${name}`);
    for (const problem of problems) console.log(`      - ${problem}`);
    if (problems.length > 0) failed += 1;
  }
  if (failed > 0) console.log(`${failed} of ${folders.length} kit folders have problems.`);
  process.exitCode = failed > 0 ? 1 : 0;
}
