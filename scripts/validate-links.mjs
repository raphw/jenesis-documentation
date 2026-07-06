// Validate every internal link and asset reference in the built site.
//
// Walks _site for .html files, extracts each href/src, and — for internal references (root-absolute or
// relative, not external, mailto, tel, data, or a bare #fragment) — checks that the target file exists.
// A pretty URL ending in "/" resolves to its index.html. Exits non-zero (failing the deploy) on any miss.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, resolve } from "node:path";

const SITE = "_site";
const EXTERNAL = /^(https?:|\/\/|mailto:|tel:|data:|#)/;

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

function targetFor(ref, fromFile) {
  let path = ref.split("#")[0].split("?")[0];
  if (!path) return null; // pure fragment / query
  let base = path.startsWith("/") ? join(SITE, path) : join(dirname(fromFile), path);
  if (path.endsWith("/")) base = join(base, "index.html");
  else if (extname(base) === "") base = join(base, "index.html"); // extensionless page dir
  return resolve(base);
}

const files = htmlFiles(SITE);
const attr = /(?:href|src)\s*=\s*"([^"]+)"/gi;
const missing = [];
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, "utf8");
  let m;
  while ((m = attr.exec(html)) !== null) {
    const ref = m[1].trim();
    if (!ref || EXTERNAL.test(ref)) continue;
    const target = targetFor(ref, file);
    if (!target) continue;
    checked++;
    if (!existsSync(target)) missing.push({ file: file.replace(SITE + "/", ""), ref });
  }
}

if (missing.length) {
  console.error(`✗ ${missing.length} broken internal reference(s):`);
  for (const { file, ref } of missing) console.error(`   ${file}  →  ${ref}`);
  process.exit(1);
}
console.log(`✓ ${checked} internal link(s) and asset(s) across ${files.length} page(s) all resolve.`);
