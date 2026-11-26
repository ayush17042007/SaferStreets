// Shared configuration for scripts/split-spec.ts and scripts/verify-spec.ts.
// The split is driven by headings found in the source files; nothing here
// contains spec text, only file names, expected headings and reading hints.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE_DIR = "docs/source";
export const SPEC_DIR = "docs/spec";

/** Prefix of the one-line header added to every split file. Followed by one blank line. */
export const HEADER_PREFIX = "> **Source:** ";

export interface PartConfig {
  /** Output file name inside docs/spec. */
  file: string;
  /** Exact heading prefix that starts this part in the source (the first part also owns any preamble). */
  heading: string;
  /** Short label used in the header and INDEX. */
  label: string;
  /** Precedence sentence placed in the file header. */
  precedence: string;
  /** Contents summary for INDEX. */
  contents: string;
  /** "Read when" hint for INDEX. */
  readWhen: string;
}

export interface SourceConfig {
  source: string;
  parts: PartConfig[];
}

const APPENDIX_RULE =
  "Appendix: source of truth for features, flows, roles, validation, tables, endpoints and security unless Part A (visuals) or Part B (backend/infra) changes them (Part 0.3).";

export const SOURCES: SourceConfig[] = [
  {
    source: "master_head.md",
    parts: [
      {
        file: "00-instructions.md",
        heading: "# PART 0:",
        label: "document preamble + PART 0",
        precedence:
          "Part 0 defines the precedence rules (0.3) and superseded decisions (0.4) that govern every other spec file.",
        contents:
          "Document map, task, why the spec exists, precedence rules (0.3), superseded decisions (0.4), prompt template (0.5), prompt scope 0-15 (0.6), Opus guidance (0.7)",
        readWhen: "Start of every prompt (0.3, 0.4); planning a prompt's scope (0.6)",
      },
      {
        file: "A-design.md",
        heading: "# PART A:",
        label: "PART A (Lamplight design)",
        precedence: "Part A overrides everything about visuals (colour, type, layout, copy, components, motion).",
        contents:
          "Design principles (A1), tokens: colours, chips, type, spacing, elevation, motion, breakpoints (A2), icons and imagery (A3), components (A4), exact screen layouts A5.1-A5.10, microcopy (A6), accessibility (A7), visual QA contract (A8)",
        readWhen: "Any UI work: tokens, components, screens, copy, visual QA",
      },
      {
        file: "B-backend.md",
        heading: "# PART B:",
        label: "PART B (backend addendum) + Appendix stub",
        precedence:
          "Part B overrides the Appendix on backend/infra decisions. Ends with master_head's empty Appendix stub; the real appendix is appendix-*.md.",
        contents:
          "Architecture and entrypoints (B1), same-origin cookies (B2), pg-boss jobs (B3), data model additions (B4), API conventions (B5), observability (B6), security additions (B7), email (B8), uploads/maps (B9), envs/CI/ops (B10), perf (B11), quality gates (B12), compliance (B13), production checklist (B14)",
        readWhen: "Any backend, jobs, infra, security, CI or deployment work",
      },
    ],
  },
  {
    source: "BLUEPRINT.md",
    parts: [
      {
        file: "appendix-01-product.md",
        heading: "## SECTION 1:",
        label: "preamble + SECTION 1",
        precedence: APPENDIX_RULE,
        contents:
          "Tag conventions ([MVP]/[OPT]/[FUTURE]), overview, problem, solution, audience, objectives (1.5 speed targets), USPs, limitations, assumptions A1-A8, gap decisions",
        readWhen: "Product scope questions, honest-limits copy, emergency numbers, assumptions",
      },
      {
        file: "appendix-02-features.md",
        heading: "## SECTION 2:",
        label: "SECTION 2",
        precedence: APPENDIX_RULE,
        contents:
          "Feature breakdown per module: 2A SafeRoute, 2B AutoMate, 2C JourneyGuard, 2D SafeAlert (features, fields, statuses, rules, states, permissions)",
        readWhen: "Building any module slice (read only that module's subsection)",
      },
      {
        file: "appendix-03-roles.md",
        heading: "## SECTION 3:",
        label: "SECTION 3",
        precedence: APPENDIX_RULE,
        contents: "System and contextual roles, full permissions matrix",
        readWhen: "Authorization, RBAC, permission and IDOR test suites",
      },
      {
        file: "appendix-04-ui.md",
        heading: "## SECTION 4:",
        label: "SECTION 4",
        precedence:
          "Section 4.1 palette/typography is superseded by Part A; 4.5 (S1-S33) remains the source for behaviour, fields, buttons and states. Part A decides how screens look.",
        contents:
          "4.1 old design direction (superseded), 4.2 navigation, 4.3 component list, 4.4 global state patterns, 4.5 screen specs S1-S33 and system pages",
        readWhen: "Screen behaviour, fields, buttons and states (S-numbers); global loading/empty/error patterns",
      },
      {
        file: "appendix-05-flows.md",
        heading: "## SECTION 5:",
        label: "SECTION 5",
        precedence: APPENDIX_RULE,
        contents: "Mermaid user flows 5.1-5.9 (auth, report, ride, journey/overdue, alert, moderation)",
        readWhen: "Implementing or E2E-testing a flow",
      },
      {
        file: "appendix-06-database.md",
        heading: "## SECTION 6:",
        label: "SECTION 6",
        precedence: APPENDIX_RULE + " Part B4 adds tables and columns.",
        contents: "Enums (6.1), tables (6.2), ER diagram (6.3), validation layers (6.4), retention (6.5)",
        readWhen: "Prisma schema, migrations, retention jobs, seed data",
      },
      {
        file: "appendix-07-backend.md",
        heading: "## SECTION 7:",
        label: "SECTION 7",
        precedence:
          APPENDIX_RULE + " Superseded by Part B: offset pagination, CORS, in-process email queue, node-cron.",
        contents:
          "Modular monolith layout (7.1), API conventions and error model (7.2), auth middleware (7.3), endpoints by module (7.4), request/response examples (7.5), validation, errors, uploads, notifications, transactions, jobs (7.6)",
        readWhen: "Endpoints, error model, middleware, transactions for a module",
      },
      {
        file: "appendix-08-stack.md",
        heading: "## SECTION 8:",
        label: "SECTION 8",
        precedence: APPENDIX_RULE + " Superseded by Part 0.4/B: Leaflet, node-cron, express-rate-limit/Redis, cors.",
        contents: "Technology stack table and deliberate exclusions",
        readWhen: "Choosing a library (check Part 0.4 first)",
      },
      {
        file: "appendix-09-security.md",
        heading: "## SECTION 9:",
        label: "SECTION 9",
        precedence: APPENDIX_RULE + " Part B7 adds Turnstile, CSP, IDOR suite and more.",
        contents:
          "OTP, sessions, authorization, validation, rate limits, contact info, location privacy, alert abuse, ride safety, admin permissions, uploads",
        readWhen: "Auth, rate limits, privacy rules, abuse controls, security hardening",
      },
      {
        file: "appendix-10-roadmap.md",
        heading: "## SECTION 10:",
        label: "SECTION 10",
        precedence: APPENDIX_RULE + " Prompt order follows Part 0.6, not this roadmap.",
        contents: "Ten-phase roadmap with dependencies and done-when criteria, weekly pacing",
        readWhen: "Rarely; prompt order is Part 0.6",
      },
      {
        file: "appendix-11-testing.md",
        heading: "## SECTION 11:",
        label: "SECTION 11",
        precedence: APPENDIX_RULE + " Part B12 sets coverage gates; Part A8 sets screenshot viewports.",
        contents: "Test types and tools, important edge cases",
        readWhen: "Writing tests for any slice; edge-case lists",
      },
      {
        file: "appendix-12-checklist.md",
        heading: "## SECTION 12:",
        label: "SECTION 12 + Consistency Check",
        precedence: APPENDIX_RULE + ' The "dark mode tokens" item is superseded (light theme only, Part 0.4).',
        contents: "Final project checklist by area, plus the trailing Consistency Check",
        readWhen: "End of each module prompt and final audits",
      },
    ],
  },
];

/** Master_head sections copied verbatim into INDEX.md (heading prefix -> stops at next "## "/"# " heading). */
export const INDEX_COPIED_SECTIONS = [
  { source: "master_head.md", heading: "## 0.3 " },
  { source: "master_head.md", heading: "## 0.4 " },
];

/** Split text into lines, each keeping its own "\n" terminator (the last may lack one). */
export function splitLinesKeep(text: string): string[] {
  const lines = text.split(/(?<=\n)/);
  return lines.length === 1 && lines[0] === "" ? [] : lines;
}

export function readSource(name: string): string {
  return readFileSync(resolve(ROOT, SOURCE_DIR, name), "utf8");
}

/** Indices of lines that start a part, skipping lines inside fenced code blocks. */
export function findPartStarts(lines: string[], parts: PartConfig[], source: string): number[] {
  const starts: number[] = [];
  let inFence = false;
  let next = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r?\n$/, "");
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    for (let p = 0; p < parts.length; p++) {
      if (line.startsWith(parts[p].heading)) {
        if (p !== next) {
          throw new Error(`${source}: heading "${parts[p].heading}" found at line ${i + 1} out of order or duplicated`);
        }
        starts.push(i);
        next++;
      }
    }
  }
  if (starts.length !== parts.length) {
    const missing = parts.slice(starts.length).map((p) => p.heading);
    throw new Error(`${source}: missing expected headings: ${missing.join(", ")}`);
  }
  return starts;
}

export interface Chunk {
  part: PartConfig;
  source: string;
  /** 1-based inclusive source line range. */
  startLine: number;
  endLine: number;
  body: string;
}

/** Split one source into chunks. The first chunk also owns any preamble before its heading. */
export function chunkSource(cfg: SourceConfig): Chunk[] {
  const text = readSource(cfg.source);
  const lines = splitLinesKeep(text);
  const starts = findPartStarts(lines, cfg.parts, cfg.source);
  starts[0] = 0; // preamble belongs to the first part
  return cfg.parts.map((part, i) => {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lines.length;
    return {
      part,
      source: cfg.source,
      startLine: from + 1,
      endLine: to,
      body: lines.slice(from, to).join(""),
    };
  });
}

export function headerLine(c: Chunk): string {
  return (
    `${HEADER_PREFIX}docs/source/${c.source}, ${c.part.label}, lines ${c.startLine}-${c.endLine} (verbatim, generated by \`pnpm spec:split\`; do not edit). ` +
    `**Precedence:** ${c.part.precedence}`
  );
}

/** Count lines the way `wc -l` does (number of newline characters). */
export function countLines(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/** Return a section (heading line through the line before the next heading of same or higher level). */
export function extractSection(sourceName: string, headingPrefix: string): string {
  const lines = splitLinesKeep(readSource(sourceName));
  const start = lines.findIndex((l) => l.startsWith(headingPrefix));
  if (start < 0) throw new Error(`${sourceName}: section "${headingPrefix}" not found`);
  const level = headingPrefix.match(/^#+/)![0].length;
  let end = lines.length;
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    const m = lines[i].match(/^(#+) /);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  // Trim trailing blank lines so the copy ends cleanly.
  while (end > start + 1 && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end).join("");
}
