import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const local = process.argv.includes("--local");
const outputRoot = resolve(projectRoot, local ? "dist/local" : "dist");
const workerPath = resolve(outputRoot, "server/index.js");
const manifestPath = resolve(outputRoot, ".openai", local ? "local-build.json" : "hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
const config = JSON.parse(manifest);
if (local) {
  assert.equal(config.version, 1);
  assert.equal(config.target, "local-preview");
  assert.equal(config.worker_entry, "server/index.js");
}

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

console.log(`${local ? "Local preview" : "Hosting"} artifact is valid ESM and exports default.fetch`);
