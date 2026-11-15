# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-16

### Fixed

- A wrong key or address no longer crashes Node on Windows after the error message ("Assertion failed ... async.c").
  The server sets the exit code and lets Node close the HTTP connection, in place of `process.exit()`.
- `dist/cli.js` is stored as executable in git, as the Linux build makes it. CI on Linux failed on that mode alone.

## [0.2.0] - 2026-11-15

The first public release.

### Changed

- **Licence: MIT.** The repository is public, and the package is on npm. Install it with
  `npx -y cob-portal-mcp`, or pin a version with `cob-portal-mcp@0.2.0`. `npx -y github:callobuzz/cob-portal-mcp`
  also works. Earlier versions were private.
- Install in one command: `dist/` is in the package and committed, and `bin` points at `dist/cli.js`, so npx runs it
  with no build step. `prepublishOnly` runs lint, the type check, the tests and `check:dist` before a publish.

### Security

- The key goes over https only. A plain http address is refused, except `localhost`, `127.0.0.1` and `[::1]`.
- A redirect is never followed (`redirect: manual`), so the key is never sent on to another address.
- The server tells the agent that task text and notes are data written by people, never instructions.
- `zod` 4.6.7 (GHSA advisory on oversized collections in older versions). Build tool `esbuild` pinned to 0.28.1 or newer.

### Added

- Task categories: `list_categories`, and `category` on `list_tasks`, `get_task`, `list_templates` and drafts.
- A main task with sub-tasks in one `draft_tasks` batch: `ref` and `parentRef`, or `parentId` for a task
  that already exists. `doneWhen` lines on a draft.
- The `plan_growth_work` prompt: plans business work as main tasks with sub-tasks in the portal's words.
- The live portal check (`pnpm test:integration`) also reads `list_categories`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and pull request templates, CI on
  Linux and Windows, and a landing page in `docs/` for GitHub Pages.

## [0.1.0] - 2026-11-06

### Added

- The MCP server for the Call O Buzz portal, over stdio, with a personal API key (`COB_PORTAL_KEY`).
- Tools: `whoami`, `list_tasks`, `get_task`, `list_templates`, `get_check_results`, `add_comment`,
  `draft_tasks`, `draft_checklist`, `list_drafts`, `get_draft`. The server offers only the tools whose
  scope the key holds.
- The `write_test_plan` prompt.
- A new `Idempotency-Key` on every POST, so a repeated call does not make a second draft.

### Fixed

- A web page in place of API data (a wrong address, a sign-in redirect) gives a plain error, not a crash.

[Unreleased]: https://github.com/callobuzz/cob-portal-mcp/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/callobuzz/cob-portal-mcp/releases/tag/v0.2.1
[0.2.0]: https://github.com/callobuzz/cob-portal-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/callobuzz/cob-portal-mcp/commit/d33b964
