# Contributing

Thanks for helping. Issues and pull requests are welcome at
[github.com/callobuzz/cob-portal-mcp](https://github.com/callobuzz/cob-portal-mcp).

## Setup

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Node 22+ and pnpm 10. `pnpm lint:fix` applies Biome's formatting and import order.

## Ground rules

- **The portal API is the source of truth.** Its description is public at
  `https://portal.callobuzz.com/api/v1/openapi.json`. Never call a route or send a field that is not in it.
- **The server only reads, comments and drafts.** A tool that approves, assigns, changes, pays, mails or
  deletes is not accepted: those stay decisions of a person in the portal.
- **One tool, one scope.** A tool declares the scope it needs in `src/tools.ts`. The server offers it only
  when the key holds that scope.
- **Every tool has a unit test** in `src/server.test.ts`, with a fake `fetch`, checking the method, the path,
  the body and the headers it sends (the key only in `Authorization`, a new `Idempotency-Key` on each POST).
- **Keys never reach output, logs or errors.**
- **`dist/` is committed.** `npx github:callobuzz/cob-portal-mcp` runs `dist/cli.js` with no build step.
  Run `pnpm build` and commit `dist/` with the source; `pnpm check:dist` fails when they differ.
- Live tests (`pnpm test:integration`) need your own key: `COB_PORTAL_URL` and `COB_PORTAL_KEY`. They only
  read, and they skip when the two are not set.

## Commits and pull requests

Small, focused commits with plain messages saying what changed and why. Add a line to
`CHANGELOG.md` under `[Unreleased]` for anything a user would notice.

By contributing you agree your work is licensed under the MIT licence, the licence of this project.
