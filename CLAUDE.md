# CLAUDE.md

This file guides Claude Code in this repository. Read it first in every session.

## What this is

**cob-portal-mcp**: the MCP server for the Call O Buzz portal. It lets an AI agent
(Claude Code, Claude Desktop, any MCP client) read tasks and send **drafts** and **notes** to the portal, with a
personal API key. It runs on the user's computer over stdio and calls the portal's HTTP API.

- Version 0.8.0. Licence MIT, Copyright 2026 Callobuzz. Public repository `callobuzz/cob-portal-mcp` and npm package
  `cob-portal-mcp` (0.2.0 published 2026-11-16; 0.2.1 committed and tagged, waiting for SV to push and publish).
- npm 12 stages a publish: the version waits on npmjs.com, Account settings, Staged Packages, until SV approves it with 2FA.
- Install: `npx -y cob-portal-mcp` from npm (pin `cob-portal-mcp@0.8.0`); `npx -y github:callobuzz/cob-portal-mcp`
  also works. `dist/` is in the package and committed, and `bin` points at `dist/cli.js`, so npx runs it with no build.
  There is no `prepare` script on purpose.
- `prepublishOnly` runs lint, type check, tests and `check:dist`, so `npm publish` refuses a stale `dist/`.
- User docs: `README.md`. Landing page: `docs/index.html` (GitHub Pages, `.github/workflows/pages.yml`).
  History: `CHANGELOG.md` (Keep a Changelog). Policy: `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- SV's rules for the public material: never link or name the portal address (examples use `https://your-portal-address`;
  the portal's "Copy MCP setup" fills the real one). Code contributions are by invitation only: no CONTRIBUTING file and
  no pull request template. Bug reports as issues are fine.

## The one safety rule

The server only **reads, comments and drafts**. It never approves a draft, assigns work, changes or deletes a task,
pays, or sends mail. A person approves every draft in the portal and decides who gets it. Every note is marked as
written through a key. Do not add a tool that breaks this, even when asked "to save a step": say why and stop.
The portal enforces the same rule on its side (a key never sends mail, approves, assigns or pays).

## Code map

| File                           | What it holds                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core.ts`                  | `VERSION`, `loadConfig` (reads `COB_PORTAL_URL`, `COB_PORTAL_KEY`, `COB_PORTAL_TIMEOUT_MS`), `PortalClient` (fetch with timeout, `Authorization: Bearer`, `User-Agent: cob-portal-mcp/<version>`, a new `Idempotency-Key` per POST), `PortalError`, `errorFromResponse` (plain hints for 401, 403, 429; a web page in place of JSON gives a plain error) |
| `src/tools.ts`                 | Every tool: name, description, zod input, the **scope** it needs, and the call it makes                                                                                                                                                                                                                                                                  |
| `src/server.ts`                | `createServer(client, me, tools)`: registers only the tools whose scope the key holds, and the prompts                                                                                                                                                                                                                                                   |
| `src/prompt.ts`                | The prompts `write_test_plan` and `plan_growth_work`                                                                                                                                                                                                                                                                                                     |
| `src/cli.ts`                   | Entry: load config, `GET /api/v1/me`, start the stdio server; a bad key stops with the plain message                                                                                                                                                                                                                                                     |
| `src/index.ts`                 | Library exports                                                                                                                                                                                                                                                                                                                                          |
| `src/server.test.ts`           | Unit tests with a fake `fetch` (24 tests): method, path, body, headers, scope gating, errors                                                                                                                                                                                                                                                             |
| `src/live.integration.test.ts` | Read-only checks against a real portal; skip unless `COB_PORTAL_URL` and `COB_PORTAL_KEY` are set                                                                                                                                                                                                                                                        |

Tools and scopes: `whoami` (none); `list_tasks`, `get_task`, `list_templates`, `list_categories` (`work:read`);
`get_check_results` (`checks:read`); `add_comment` (`work:comment`); `draft_tasks`, `draft_checklist`, `list_drafts`,
`get_draft` (`work:draft`).

## The portal side (another repo)

The API lives in the website repo `J:/callobuzz/callobuzz-website`, app `portal/` (Next.js 16). This repo is linked
there as `mcp/cob-portal-mcp` (a junction to this folder). Read the portal code before you change a call.

| What                                             | Where in `portal/`                                                                                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes (`/api/v1/*`)                             | `src/app/api/v1/`: `me`, `tasks`, `tasks/[id]`, `tasks/[id]/comments`, `tasks/[id]/checks`, `templates`, `categories`, `drafts`, `drafts/[batchId]`, `openapi.json` |
| Keys, auth, rate limit, idempotency, error shape | `src/lib/api/` (`auth.ts`, `keys.ts`, `respond.ts`, `schemas.ts`, `openapi.ts`)                                                                                     |
| Scopes and what each allows                      | `src/lib/api/scopes.ts` (`API_SCOPES`, `SCOPE_INFO`)                                                                                                                |
| Profile, API keys card, "Copy MCP setup"         | `src/components/api-keys/` (`api-keys-card.tsx`, `keys-manager.tsx`)                                                                                                |
| Settings for the install line and guide link     | `src/lib/settings/lanes/growth-mcp.ts`: `api.mcp_package` (default `github:callobuzz/cob-portal-mcp`), `api.mcp_guide_url` (default the README on GitHub)           |
| Tests                                            | `tests/integration/api-v1.test.ts`, `tests/integration/api-keys.test.ts`, `tests/e2e/api-v1.spec.ts`                                                                |

The live description is at `<portal address>/api/v1/openapi.json`. It is the source of truth. Never
call a route or send a field that is not in it. A new portal route is added in the portal repo first, with its test,
then here.

Making a key needs two-step sign-in and the `api:keys` permission (portal Profile, API keys). Keys start with `cob_`.

## Commands

```bash
pnpm install
pnpm lint            # biome (LF line endings; .gitattributes keeps them)
pnpm typecheck       # tsc
pnpm test            # unit tests, fake fetch
pnpm build           # tsup -> dist/
pnpm check:dist      # builds and fails when dist/ differs from the commit
COB_PORTAL_URL=<portal address> COB_PORTAL_KEY=cob_... pnpm test:integration   # read-only, live
```

Run the server by hand: `node dist/cli.js` with the two variables set. With none set it stops at once with
"COB_PORTAL_URL is not set" (CI checks this).

## Rules for every change

- Change the code and its unit test together. A new tool gets a test of its method, path, body and headers, and of
  its scope gating.
- The key never reaches output, logs, errors or a URL.
- Rebuild and commit `dist/` with the source in the same commit. `pnpm check:dist` must pass.
- A change a user would notice gets a line in `CHANGELOG.md` under `[Unreleased]`.
- Words: plain English, short sentences, active voice, no em dashes. Tool descriptions are read by the agent, so say
  exactly what the tool does and what it never does.

## Release

1. Bump `version` in `package.json` and `VERSION` in `src/core.ts`. Move `[Unreleased]` to the new version in `CHANGELOG.md`.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, then commit source and `dist/` together.
3. `pnpm check:dist` passes on the commit. Tag it `v<version>`.
4. SV pushes the branch and the tag, makes the GitHub release, and runs `npm publish`. The exact commands are in the
   website repo, `deploy/GO-LIVE.html`, step 17.2. In the portal, Settings, `api.mcp_package` can pin a version
   (`cob-portal-mcp@<version>`).

## Working rules (SV)

- **Never push and never touch the remote** (no `git push`, `fetch`, `pull`, `ls-remote`, no `gh` that hits the repo),
  unless SV asks in that message. Your job ends at the commit. SV pushes by hand.
- No `Co-Authored-By` or any AI line in commits.
- Never read or write dotenv or credential files. Never put a real key in a file, a test or a chat.
- Scratch files go in `.work/` of this repo (git-ignored), never in a temp folder or another project.
- Report to SV in Simplified Technical English: active voice, one idea per sentence, 20 words or fewer per sentence.
- Commands for SV are Git Bash commands with forward slashes.

## State on 2026-11-15, and what is next

Done in this repo: MIT licence, public README, landing page, SECURITY, CODE_OF_CONDUCT, CHANGELOG,
issue templates, CI (Linux and Windows, Node 22 and 24, with `check:dist` and a CLI smoke test), Pages
workflow, LF line endings. Lint, type check, 24 unit tests, `check:dist` and `pnpm audit` (no known vulnerabilities) pass. Against the live portal the server
starts, calls `/api/v1/me`, and refuses a wrong key with the plain message.

Next, in order:

1. **Publish (SV).** GitHub repo, push, Pages, security settings, release v0.2.0 and npm: the website repo,
   `deploy/GO-LIVE.html`, step 17.2, in order. The release notes are `.github/release-notes/v0.2.0.md`.
2. **Check the install** on a clean shell: `npx -y cob-portal-mcp` with a fake key must print the 401 message
   (step 17.2 ends with it). The portal's "Copy MCP setup" uses the setting `api.mcp_package` (default `cob-portal-mcp`).
3. **Claude Code on SV's laptop** (needs SV's key, SV runs it): the website repo, `deploy/GO-LIVE.html`, step 17.1.
4. **Website showcase**: a page on `callobuzz.com/open-source` like the other COB MCP servers (website repo,
   `src/app/open-source/`), and a news post if SV wants one.
5. **Ideas, not started** (ask SV before any): a `list_people` or team read for planning, a `get_template` tool, a
   resource for the plan JSON schema, an MCP Registry entry (`server.json`, as cob-rag-mcp has).
