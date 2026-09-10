import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const [site, distDirectory] = process.argv.slice(2);
const apiHost = "bdg-ai-help-api-render.onrender.com";

const checks = {
  guide: [apiHost, "Close image"],
  chat: [apiHost, "Close image", "/__platform/identity", "x-platform-web-identity"],
  admin: [apiHost, "FAQ answer", "/__platform/identity", "x-platform-web-identity"],
  staff: [apiHost, "Customer Service Console", "/__platform/identity", "x-platform-web-identity"],
};

if (!checks[site] || !distDirectory) {
  throw new Error("Usage: verify-static-release.mjs <guide|chat|admin|staff> <dist-directory>");
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = join(directory, entry.name);
    return entry.isDirectory() ? files(fullPath) : [fullPath];
  }));
  return nested.flat();
}

const allFiles = await files(distDirectory);
const markerFile = join(distDirectory, "bdg-release.json");
let marker;
try {
  marker = JSON.parse(await readFile(markerFile, "utf8"));
} catch (error) {
  throw new Error(`${site} build is missing a readable bdg-release.json marker: ${error.message}`);
}
if (marker.site !== site || !marker.api_version || !marker.git_sha) {
  throw new Error(`${site} build has an invalid release marker.`);
}
const text = (await Promise.all(allFiles.map(async (file) => {
  try { return await readFile(file, "utf8"); } catch { return ""; }
}))).join("\n");

for (const requiredText of checks[site]) {
  if (!text.includes(requiredText)) {
    throw new Error(`${site} build is missing required release marker: ${requiredText}`);
  }
}
if (text.includes("bdg-ai-help-api.bdgservice.workers.dev")) {
  throw new Error(`${site} build still contains the retired Worker API URL.`);
}

console.log(`PASS ${site} production build (${allFiles.length} files checked)`);
