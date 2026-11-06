#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, PortalClient, VERSION } from "./core.js";
import { createServer } from "./server.js";

// stdout belongs to the protocol. Messages for people go to stderr, and never contain the key.
async function main(): Promise<void> {
	const config = loadConfig();
	const client = new PortalClient(config);
	// Fails at once, with a clear message, when the key or the address is wrong.
	const me = await client.me();
	const { server, tools } = createServer(client, me);
	await server.connect(new StdioServerTransport());
	process.stderr.write(`cob-portal-mcp ${VERSION}: ${config.url} as ${me.person.name}; ${tools.length} tools\n`);
}

main().catch((err) => {
	process.stderr.write(`cob-portal-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
	process.exit(1);
});
