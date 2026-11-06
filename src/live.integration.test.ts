/**
 * Live test against a real portal: `pnpm test:integration`.
 * Skipped unless COB_PORTAL_URL and COB_PORTAL_KEY are set. It only reads (whoami, list_templates).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig, PortalClient } from "./core.js";
import { createServer } from "./server.js";

const live = Boolean(process.env.COB_PORTAL_URL && process.env.COB_PORTAL_KEY);

describe.skipIf(!live)("live portal", () => {
	it("calls whoami and list_templates through an MCP session", async () => {
		const client = new PortalClient(loadConfig());
		const me = await client.me();
		const { server } = createServer(client, me);
		const [a, b] = InMemoryTransport.createLinkedPair();
		const mcp = new Client({ name: "it", version: "0" });
		await Promise.all([server.connect(a), mcp.connect(b)]);

		const names = (await mcp.listTools()).tools.map((t) => t.name);
		expect(names).toContain("whoami");

		const who = await mcp.callTool({ name: "whoami", arguments: {} });
		expect(who.isError).toBeFalsy();
		const whoText = (who.content as { text: string }[])[0]?.text ?? "";
		expect(JSON.parse(whoText).key.scopes).toEqual(me.key.scopes);

		if (me.key.scopes.includes("work:read")) {
			const t = await mcp.callTool({ name: "list_templates", arguments: {} });
			expect(t.isError).toBeFalsy();
			const body = JSON.parse((t.content as { text: string }[])[0]?.text ?? "{}");
			expect(Array.isArray(body.templates)).toBe(true);
		} else {
			expect(names).not.toContain("list_templates");
		}
	});
});
