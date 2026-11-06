# cob-portal-mcp

An MCP server for the Call O Buzz portal. It lets an AI agent (Claude Code, Claude Desktop, or any MCP client) read tasks and
send **drafts** and **notes** to the portal. It runs on your computer and talks to the portal API with a personal API key.

> **Safety note.** The agent can only make drafts and comments. It cannot assign work, approve a draft, change a task or
> delete anything. A person must approve every draft in the portal before it becomes a task. Every note it writes is marked
> as written through the key.

## Settings

| Variable                | Needed | Meaning                                                                                                                                                |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `COB_PORTAL_URL`        | yes    | The portal address, for example `https://portal.example.com`. No trailing slash.                                                                       |
| `COB_PORTAL_KEY`        | yes    | A personal key that starts with `cob_`. The server sends it only as an `Authorization: Bearer` header. It never writes it to a log, an error or a URL. |
| `COB_PORTAL_TIMEOUT_MS` | no     | How long to wait for one portal answer. Default `30000`. Minimum `1000`.                                                                               |

## Make a key

1. Sign in to the portal. Your account needs two-factor sign-in (2FA) on.
2. Open **Profile**, then **API keys**.
3. Make a new key. Choose its scopes and how long it lasts. Copy it at once. The portal shows it only one time.
4. Put it in `COB_PORTAL_KEY`. A key acts as you, cut down to its scopes. It never has more rights than you.

If a key stops working, make a new one on the same page.

## Scopes

| Scope          | What it allows                                                          |
| -------------- | ----------------------------------------------------------------------- |
| `work:read`    | Read tasks and task templates.                                          |
| `work:draft`   | Send draft tasks and check lists for approval. Read your draft batches. |
| `work:comment` | Write notes on tasks.                                                   |
| `checks:read`  | Read check list results.                                                |

At start the server calls `GET /api/v1/me` and offers **only the tools whose scope the key has**. `whoami` needs no scope.

## Tools

| Tool                | Scope          | What it does                                                         |
| ------------------- | -------------- | -------------------------------------------------------------------- |
| `whoami`            | none           | Shows the person, the key name, its scopes and its end date.         |
| `list_tasks`        | `work:read`    | Lists tasks (`scope` mine or team, `status`, `limit`).               |
| `get_task`          | `work:read`    | Reads one task with its steps, answers and notes.                    |
| `list_templates`    | `work:read`    | Lists the published task templates.                                  |
| `get_check_results` | `checks:read`  | Reads the test runs and skips of a check list task. File names only. |
| `add_comment`       | `work:comment` | Writes a note on a task.                                             |
| `draft_tasks`       | `work:draft`   | Sends a batch of draft tasks.                                        |
| `draft_checklist`   | `work:draft`   | Sends a test plan (plan JSON) as one draft with a check list.        |
| `list_drafts`       | `work:draft`   | Lists the draft batches you sent.                                    |
| `get_draft`         | `work:draft`   | Reads one draft batch, with the state of each draft.                 |

Every POST carries a new `Idempotency-Key` (a UUID for each tool call), so a repeated call does not make a second draft.

## Prompt

`write_test_plan` (optional argument `subject`) explains the plan JSON format (areas, cases, id, title, priority, device
`phone|laptop|both`, url, preconditions, steps, expected, screenshot) and the writing rules: plain English a junior tester can
follow, real page paths and button labels, one idea per step, a precise expected result. Then the agent sends the plan with
`draft_checklist`. The draft waits for a person to approve it in the portal.

## Errors

When the portal refuses a call, the agent gets the portal's error code, its message and every `details` path, so it can fix the
input and send again. Three statuses add a plain hint:

- `401`: the key is wrong, ended or revoked. Make a new key on the Profile page.
- `403`: the key lacks a scope, or you lack the right. Make a new key with the scope.
- `429`: too many calls. Wait a minute.

## Use it

Build once:

```bash
pnpm install
pnpm build
```

### Claude Code

```bash
claude mcp add cob-portal \
  --env COB_PORTAL_URL=https://portal.example.com \
  --env COB_PORTAL_KEY=cob_your_key_here \
  -- node /path/to/mcp-servers/cob-portal-mcp/dist/cli.js
```

### Claude Desktop

Add this to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
	"mcpServers": {
		"cob-portal": {
			"command": "node",
			"args": ["/path/to/mcp-servers/cob-portal-mcp/dist/cli.js"],
			"env": {
				"COB_PORTAL_URL": "https://portal.example.com",
				"COB_PORTAL_KEY": "cob_your_key_here"
			}
		}
	}
}
```

On Windows write the path with forward slashes, for example `J:/callobuzz/mcp-servers/cob-portal-mcp/dist/cli.js`.

## Develop

```bash
pnpm lint          # biome
pnpm typecheck     # tsc
pnpm test          # unit tests with a fake fetch (this package is a client of an HTTP API)
pnpm build         # tsup
COB_PORTAL_URL=... COB_PORTAL_KEY=... pnpm test:integration   # real portal, read-only; skips when unset
```

This package does not depend on `cob-mcp-cli-kit`, as `cob-rag-mcp` does not. It uses the MCP SDK directly.
