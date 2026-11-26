# SaferStreets

Safer Streets. Smarter Journeys. Stronger Communities.

A web platform for India, campus-first, with four modules behind one account:

- **SafeRoute**: report and track unsafe spots and broken infrastructure.
- **AutoMate**: share auto-rickshaw rides and split the fare.
- **JourneyGuard**: tell a trusted contact where you're going and when you'll arrive.
- **SafeAlert**: warn opted-in people nearby when something goes wrong.

Plus moderation and admin. SaferStreets is not an emergency service: no live tracking, no police integration. In danger, call 112.

## Status

Spec and scaffolding only. No application code yet. Progress lives in [docs/PROGRESS.md](docs/PROGRESS.md).

## How the docs are organised

| Path                                                          | What it is                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [CLAUDE.md](CLAUDE.md)                                        | Project rules the build agent reads every session                                                |
| `docs/source/`                                                | The two original documents (`master_head.md`, `BLUEPRINT.md`). Edit these, never the split files |
| [docs/spec/INDEX.md](docs/spec/INDEX.md)                      | Map of every spec file, line counts, when to read it, precedence rules                           |
| `docs/spec/00-instructions.md`, `A-design.md`, `B-backend.md` | master_head split by Part (0, A design, B backend)                                               |
| `docs/spec/appendix-NN-*.md`                                  | BLUEPRINT split by Section 1 to 12                                                               |
| [docs/spec/DECISIONS.md](docs/spec/DECISIONS.md)              | Conflicts between the two documents and which choice wins                                        |
| [docs/PROGRESS.md](docs/PROGRESS.md)                          | Done / next / known issues, decisions, design deviations                                         |
| `docs/qa/<prompt>/`                                           | Visual QA screenshots per prompt (committed)                                                     |

Precedence: Part A wins on visuals, Part B wins on backend/infra, the appendix is the source of truth for features, rules, tables, endpoints and security.

## Spec scripts

```sh
pnpm install
pnpm spec:split    # regenerate docs/spec/* from docs/source/*
pnpm spec:verify   # check the split is lossless and INDEX line counts are current
```

## Run order

Run order lives in the pack's run guide.
