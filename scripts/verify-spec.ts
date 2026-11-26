// Verifies that docs/spec/* is a lossless split of docs/source/*:
//  1. every expected file exists and starts with exactly one header line + one blank line;
//  2. concatenating the file bodies (headers removed) reproduces each source byte for byte;
//  3. INDEX.md lists every file with its current line count and carries the verbatim
//     copies of Part 0.3 and 0.4;
//  4. DECISIONS.md exists.
// Exits non-zero on any failure.
//
// Usage: pnpm spec:verify

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HEADER_PREFIX,
  INDEX_COPIED_SECTIONS,
  ROOT,
  SOURCES,
  SPEC_DIR,
  countLines,
  extractSection,
  readSource,
  splitLinesKeep,
} from "./spec-config.ts";

const errors: string[] = [];
const specPath = (f: string) => resolve(ROOT, SPEC_DIR, f);

const indexPath = specPath("INDEX.md");
const index = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";
if (!index) errors.push("docs/spec/INDEX.md is missing");

let fileCount = 0;

for (const cfg of SOURCES) {
  const bodies: string[] = [];
  for (const part of cfg.parts) {
    const p = specPath(part.file);
    if (!existsSync(p)) {
      errors.push(`missing ${SPEC_DIR}/${part.file}`);
      continue;
    }
    fileCount++;
    const content = readFileSync(p, "utf8");
    const nl = content.indexOf("\n");
    const header = nl >= 0 ? content.slice(0, nl) : content;
    if (!header.startsWith(HEADER_PREFIX) || content.slice(nl + 1, nl + 2) !== "\n") {
      errors.push(`${part.file}: expected one "${HEADER_PREFIX}..." header line followed by a blank line`);
      continue;
    }
    const body = content.slice(nl + 2);
    // The first file of each source also owns the preamble; later files must start at their heading.
    if (bodies.length > 0 && !body.startsWith(part.heading)) {
      errors.push(`${part.file}: body does not start with heading "${part.heading}"`);
    }
    bodies.push(body);

    // INDEX line count for this file
    const lines = countLines(content);
    const row = index.split("\n").find((l) => l.startsWith(`| [${part.file}](`));
    if (!row) errors.push(`INDEX.md has no row for ${part.file}`);
    else {
      const cells = row.split(/(?<!\\)\|/).map((c) => c.trim());
      const listed = Number(cells[3]);
      if (listed !== lines) errors.push(`INDEX.md lists ${listed} lines for ${part.file}, actual ${lines}`);
    }
  }

  const source = readSource(cfg.source);
  const joined = bodies.join("");
  if (joined !== source) {
    const a = splitLinesKeep(source);
    const b = splitLinesKeep(joined);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    errors.push(
      `${cfg.source}: concatenated split differs from source at line ${i + 1} ` +
        `(source ${a.length} lines, split ${b.length} lines)\n  source: ${JSON.stringify(a[i] ?? "<EOF>")}\n  split:  ${JSON.stringify(b[i] ?? "<EOF>")}`,
    );
  } else {
    console.log(`ok  ${cfg.source}: ${countLines(source)} lines reproduced exactly from ${cfg.parts.length} files`);
  }
}

for (const s of INDEX_COPIED_SECTIONS) {
  const section = extractSection(s.source, s.heading).replace(/\s*$/, "");
  if (!index.includes(section)) errors.push(`INDEX.md does not contain a verbatim copy of "${s.heading.trim()}"`);
}

if (!existsSync(specPath("DECISIONS.md"))) errors.push("docs/spec/DECISIONS.md is missing");
else fileCount++;
if (index) fileCount++;

if (errors.length) {
  console.error(`\nspec:verify FAILED (${errors.length} problem(s)):`);
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`ok  INDEX.md line counts and copied sections match; ${fileCount} files in ${SPEC_DIR}/`);
console.log("spec:verify passed");
