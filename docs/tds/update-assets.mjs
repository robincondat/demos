// Keep all local TDS entry points and transitive dependencies on one release.
// Usage from docs/: node tds/update-assets.mjs [new-version]
import { readFile, writeFile, readdir } from "node:fs/promises";
const root = new URL("./", import.meta.url);
const configURL = new URL("assets-version.json", root);
const config = JSON.parse(await readFile(configURL, "utf8"));
const version = process.argv[2] || config.version;
if (!/^[A-Za-z0-9_-]+$/.test(version)) throw Error("Invalid asset version");
let updated = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) {
      await visit(url);
      continue;
    }
    if (!/\.(js|css|html)$/.test(entry.name)) continue;
    const source = await readFile(url, "utf8");
    const next = source.replace(/(\.(?:js|css|py)\?v=)[A-Za-z0-9_-]+/g, `$1${version}`);
    if (next !== source) {
      await writeFile(url, next);
      updated++;
    }
  }
}
await visit(root);
await writeFile(configURL, JSON.stringify({ version }, null, 2) + "\n");
console.log(`TDS assets ${version}: ${updated} files updated`);
