import { readFile } from "node:fs/promises";

const file = "backend-api/src/server.js";
const content = await readFile(file, "utf8");
const match = content.match(/const\s+API_VERSION\s*=\s*['\"]([^'\"]+)['\"]/);

if (!match) {
  throw new Error(`Could not read the authoritative release version from ${file}.`);
}

process.stdout.write(match[1]);
