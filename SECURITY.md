# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.2.x   | Yes       |
| 0.1.x   | No        |

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Please use [GitHub Private Vulnerability Reporting](https://github.com/callobuzz/cob-portal-mcp/security/advisories/new),
or email callobuzz@gmail.com.

You should receive an initial response within 48 hours. We will work with you to understand the
issue and coordinate a fix before any public disclosure.

A problem in the portal itself (the API at `https://portal.callobuzz.com/api/v1`, sign-in, keys or
permissions) is in scope too: report it the same way. Do not test it against data that is not yours.

## Scope

- The `cob-portal-mcp` package: the stdio MCP server and its tools and prompts
- Key handling: the key is read from `COB_PORTAL_KEY`, sent only as an `Authorization: Bearer`
  header, and never written to a log, an error message or a URL
- Tool gating: the server offers only the tools whose scope the key holds (`GET /api/v1/me`)
- Transport: https only (plain http only for `localhost`); a redirect is never followed, so the key is never sent on
- Error handling: portal answers that are not API data (a web page, a redirect) give a plain error
- Prompt injection: task text and notes come from people; the server tells the agent to treat them as data, and every
  draft still waits for a person
- Dependency vulnerabilities

## What a key can and cannot do

A key acts as the person who made it, cut down to the scopes they ticked. It never has more rights
than that person. Through this server an agent can read tasks, templates, categories and check list
results, write notes on tasks, and send **drafts**. It cannot approve a draft, assign work, change or
delete a task, pay, or send mail. A person approves every draft in the portal and decides who gets it.

## Best Practices for Users

- Give an agent the **narrowest key** that does the job: `work:read` alone when it only reads.
- Give a key a short life, and one key per computer, so you can revoke one without the others.
- Revoke a key at once on the portal Profile page, under API keys, when a laptop is lost or a key
  leaked. A revoked key stops working on the next call.
- Never commit a key or paste it into a chat. Keep it in your MCP client's settings only.
