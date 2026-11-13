import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Me, PortalClient } from "./core.js";
import { PortalError, VERSION } from "./core.js";
import { growthPlanPrompt, testPlanPrompt } from "./prompt.js";
import { ALL_TOOLS, type AnyTool, visibleTools } from "./tools.js";

export interface CreatedServer {
	server: McpServer;
	tools: AnyTool[];
}

/** Builds the MCP server for one key. The key's scopes (from /api/v1/me) decide which tools exist. */
export function createServer(client: PortalClient, me: Me, allTools: readonly AnyTool[] = ALL_TOOLS): CreatedServer {
	const server = new McpServer(
		{ name: "cob-portal-mcp", version: VERSION },
		{
			instructions:
				`This server connects to the Call O Buzz portal as ${me.person.name}, with the key "${me.key.name}". ` +
				"The key can read work and make drafts and notes only. A person approves every draft in the portal.",
		},
	);
	const tools = visibleTools(allTools, me.key.scopes);
	const ctx = { client, me };

	for (const tool of tools) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.input,
				annotations: {
					title: tool.title,
					readOnlyHint: !tool.write,
					destructiveHint: false,
					idempotentHint: !tool.write,
					openWorldHint: false,
				},
			},
			async (args: Record<string, unknown>): Promise<CallToolResult> => {
				try {
					const input = z
						.object(tool.input)
						.strict()
						.parse(args ?? {});
					const data = await tool.handler(input, ctx);
					return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
				} catch (err) {
					const text = err instanceof PortalError ? err.message : err instanceof Error ? err.message : String(err);
					return { isError: true, content: [{ type: "text", text }] };
				}
			},
		);
	}

	server.registerPrompt(
		"write_test_plan",
		{
			title: "Write a test plan",
			description: "Explains the plan JSON format and the writing rules, then sends the plan with draft_checklist.",
			argsSchema: { subject: z.string().optional().describe("What to test, for example a feature or a page.") },
		},
		({ subject }) => ({ messages: [{ role: "user", content: { type: "text", text: testPlanPrompt(subject ?? "") } }] }),
	);

	server.registerPrompt(
		"plan_growth_work",
		{
			title: "Plan growth work",
			description:
				"Explains how to draft a main task with its sub-tasks in the portal's words (ref, parentRef, category, done when), then send them with draft_tasks.",
			argsSchema: {
				goal: z.string().optional().describe("The business goal, for example: win long-term US clients as an agency."),
				category: z.string().optional().describe("The task category. Default: Marketing and business growth."),
			},
		},
		({ goal, category }) => ({
			messages: [{ role: "user", content: { type: "text", text: growthPlanPrompt(goal ?? "", category ?? "") } }],
		}),
	);

	return { server, tools };
}
