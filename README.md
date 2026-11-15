# cob-portal-mcp

**[Website](https://callobuzz.github.io/cob-portal-mcp)** · **[Call O Buzz portal](https://portal.callobuzz.com)** · **[Callobuzz open source](https://callobuzz.com/open-source)** · **[Changelog](./CHANGELOG.md)**

[![build](https://img.shields.io/github/actions/workflow/status/callobuzz/cob-portal-mcp/ci.yml?branch=main)](https://github.com/callobuzz/cob-portal-mcp/actions)
[![release](https://img.shields.io/github/v/release/callobuzz/cob-portal-mcp?color=blue)](https://github.com/callobuzz/cob-portal-mcp/releases)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GitHub stars](https://img.shields.io/github/stars/callobuzz/cob-portal-mcp?style=social)](https://github.com/callobuzz/cob-portal-mcp)

**An MCP server for the Call O Buzz portal.** It lets an AI agent (Claude Code, Claude Desktop, or any MCP client) read
tasks and send **drafts** and **notes** to the portal. It runs on your computer and talks to the portal API with a personal
API key.

> [!IMPORTANT]
> **The agent can only make drafts and notes.** It cannot assign work, approve a draft, change a task, pay, send mail or
> delete anything. A person must approve every draft in the portal before it becomes a task, and that person decides who
> gets it. Every note it writes is marked as written through the key.

## Why

A good agent can plan work, write a test plan or break a goal into tasks. The portal is where a team tracks that work. This
server connects the two, and keeps a person in charge:

- **The agent reads.** It lists tasks, templates and categories, and reads one task with its steps, answers and notes.
- **The agent proposes.** It sends draft tasks (a main task with sub-tasks) or a test plan as a check list draft.
- **A person decides.** The drafts wait in the portal. A person approves, rejects and assigns them.
- **The key sets the reach.** The server offers only the tools that the scopes of the key allow.

## Prerequisites

- **Node.js 22 or newer.**
- **A portal account** with two-step sign-in (2FA) on, at [portal.callobuzz.com](https://portal.callobuzz.com).
- **A personal API key** from the portal (see [Make a key](#make-a-key)).

## Install in one command

1. Make a key (see [Make a key](#make-a-key)). Copy it.
2. Add the server to your AI agent. npx downloads it from GitHub and starts it. Nothing is built on your computer.

### Claude Code

```bash
claude mcp add cob-portal \
  --env COB_PORTAL_URL=https://portal.callobuzz.com \
  --env COB_PORTAL_KEY=cob_your_key_here \
  -- npx -y github:callobuzz/cob-portal-mcp
```

### Claude Desktop

Add this to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
	"mcpServers": {
		"cob-portal": {
			"command": "npx",
			"args": ["-y", "github:callobuzz/cob-portal-mcp"],
			"env": {
				"COB_PORTAL_URL": "https://portal.callobuzz.com",
				"COB_PORTAL_KEY": "cob_your_key_here"
			}
		}
	}
}
```

The portal's Profile page shows this block with your new key and the portal address filled in ("Copy MCP setup").

3. Check it: ask the agent to run `whoami`. It answers with your name, the key name and its scopes.

Notes:

- To stay on one version, add a tag: `github:callobuzz/cob-portal-mcp#v0.2.0`.
- To use a folder copy, clone the repository and write `node <path>/dist/cli.js` in place of `npx -y ...`. On Windows write
  the path with forward slashes, for example `J:/callobuzz/mcp-servers/cob-portal-mcp/dist/cli.js`.

Why it works with no build: the built files in `dist/` are committed, and `bin` points at `dist/cli.js`. npx installs the two
runtime packages (`@modelcontextprotocol/sdk`, `zod`) and runs it. There is no `prepare` script, so an install never needs
the build tools.

## Settings

| Variable                | Needed | Meaning                                                                                                                                                |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COB_PORTAL_URL`        | yes    | The portal address: `https://portal.callobuzz.com`. It must be https; plain http is allowed only for `localhost`.                                      |
| `COB_PORTAL_KEY`        | yes    | A personal key that starts with `cob_`. The server sends it only as an `Authorization: Bearer` header. It never writes it to a log, an error or a URL. |
| `COB_PORTAL_TIMEOUT_MS` | no     | How long to wait for one portal answer. Default `30000`. Minimum `1000`.                                                                               |

## Make a key

1. Sign in to the portal. Your account needs two-step sign-in (2FA) on.
2. Open **Profile**, then **API keys**.
3. Make a new key. Choose its scopes and how long it lasts. Copy it at once. The portal shows it only one time.
4. Put it in `COB_PORTAL_KEY`. A key acts as you, cut down to its scopes. It never has more rights than you.

If a key stops working, make a new one on the same page.

## Scopes

| Scope          | What it allows                                                          |
| -------------- | ----------------------------------------------------------------------- |
| `work:read`    | Read tasks, task templates and task categories.                         |
| `work:draft`   | Send draft tasks and check lists for approval. Read your draft batches. |
| `work:comment` | Write notes on tasks.                                                   |
| `checks:read`  | Read check list results.                                                |

At start the server calls `GET /api/v1/me` and offers **only the tools whose scope the key has**. `whoami` needs no scope.

## Tools

| Tool                | Scope          | What it does                                                                                  |
| ------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `whoami`            | none           | Shows the person, the key name, its scopes and its end date.                                  |
| `list_tasks`        | `work:read`    | Lists tasks (`scope` mine or team, `status`, `limit`, `category`, `parent_id` for sub-tasks). |
| `get_task`          | `work:read`    | Reads one task with its steps, answers, notes, category, parent and sub-task count.           |
| `list_templates`    | `work:read`    | Lists the published task templates, with their category.                                      |
| `list_categories`   | `work:read`    | Lists the task categories the portal offers.                                                  |
| `get_check_results` | `checks:read`  | Reads the test runs and skips of a check list task. File names only.                          |
| `add_comment`       | `work:comment` | Writes a note on a task.                                                                      |
| `draft_tasks`       | `work:draft`   | Sends a batch of draft tasks. A batch can hold main tasks with their sub-tasks (see below).   |
| `draft_checklist`   | `work:draft`   | Sends a test plan (plan JSON) as one draft with a check list.                                 |
| `list_drafts`       | `work:draft`   | Lists the draft batches you sent.                                                             |
| `get_draft`         | `work:draft`   | Reads one draft batch, with the state, category and parent of each draft.                     |

Every POST carries a new `Idempotency-Key` (a UUID for each tool call), so a repeated call does not make a second draft.

### A main task with sub-tasks

Each draft in `draft_tasks` takes `title`, and optionally `templateKey` or `body`, `notes`, `priority`, `dueAt`, `category`,
`doneWhen` (lines), and one of:

- `ref` plus `parentRef`: give the main task a `ref`; each sub-task names it in `parentRef` and comes after it in the list.
- `parentId`: hang the draft under a task that already exists.

A sub-task takes its main task's category when it has none. When the admin approves the batch, the tree stays: the main
tasks go to the person or pool the admin picks, and the sub-tasks can wait so the admin gives each one later.

## Prompts

- `write_test_plan` (optional `subject`) explains the plan JSON format (areas, cases, id, title, priority, device
  `phone|laptop|both`, url, preconditions, steps, expected, screenshot) and the writing rules, then the agent sends the plan
  with `draft_checklist`.
- `plan_growth_work` (optional `goal`, `category`) explains how to plan business work as main tasks with sub-tasks in the
  portal's words: one result per task, "What to hand in" in the notes, a `doneWhen` a reviewer can check, numbers as starting
  values. Then the agent sends it with `draft_tasks`.

Each draft waits for a person to approve it in the portal.

## Errors

When the portal refuses a call, the agent gets the portal's error code, its message and every `details` path (for example
`drafts[3].parentRef`), so it can fix the input and send again. Three statuses add a plain hint:

- `401`: the key is wrong, ended or revoked. Make a new key on the Profile page.
- `403`: the key lacks a scope, or you lack the right. Make a new key with the scope.
- `429`: too many calls. Wait a minute.

## Security model

- **It runs on your computer.** The server is a local program. The agent talks to it over stdio, and it talks to the portal.
- **The key goes over https only.** A plain http address is refused, except `localhost`. A redirect is never followed, so the
  key is never sent on to another address.
- **Portal text is data.** Task text and notes are written by people. The server tells the agent to read them as data, never
  as instructions. Review what an agent drafts before you approve it.
- **The key stays in the header.** The server sends the key only as an `Authorization: Bearer` header. It never writes the
  key to a log, an error or a URL.
- **The key acts as you, cut to its scopes.** A key never has more rights than the person who made it.
- **The agent can only make drafts and notes.** It cannot approve, assign, change a task, pay, send mail or delete.
- **A person approves every draft.** Nothing becomes a task until a person approves it in the portal.
- **You can revoke a key at any time.** Open the portal Profile page and revoke the key. It stops working at once.
- **Report a vulnerability in private.** Follow [SECURITY.md](./SECURITY.md). Do not open a public issue.

## Develop

```bash
pnpm install
pnpm lint          # biome
pnpm typecheck     # tsc
pnpm test          # unit tests with a fake fetch (this package is a client of an HTTP API)
pnpm build         # tsup, writes dist/
pnpm check:dist    # builds and fails when dist/ differs from the commit
COB_PORTAL_URL=... COB_PORTAL_KEY=... pnpm test:integration   # real portal, read-only; skips when unset
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

### Release

1. Change the code and the tests. Bump `version` in `package.json` and `VERSION` in `src/core.ts`.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
3. Commit the source and `dist/` together. `pnpm check:dist` must pass after the commit.
4. Tag the commit `v<version>` and push the tag, so people can pin it.

This package does not depend on `cob-mcp-cli-kit`, as `cob-rag-mcp` does not. It uses the MCP SDK directly.

## Changelog

[CHANGELOG.md](./CHANGELOG.md)

## Licence

[MIT](./LICENSE). Copyright 2026 Callobuzz. Built by [Call O Buzz Services](https://callobuzz.com).
