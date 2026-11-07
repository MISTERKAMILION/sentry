import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "tests",
]);
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const forbidden = [
  /SUPABASE_SERVICE_ROLE_KEY/i,
  /service[_-]?role/i,
  /GROQ_API_KEY/i,
  /groq-sdk/i,
  /ai\/groq-client/i,
];
const violations = [];

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(absolute);
      continue;
    }
    if (!sourceExtensions.has(path.extname(entry.name))) continue;

    const contents = await readFile(absolute, "utf8");
    if (!/^\s*["']use client["']/m.test(contents)) continue;
    if (forbidden.some((pattern) => pattern.test(contents))) {
      violations.push(path.relative(root, absolute));
    }
  }
}

await visit(root);
if (violations.length > 0) {
  console.error("Server-only credential references found in client files:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log('No server-only credential references found in any "use client" file.');
