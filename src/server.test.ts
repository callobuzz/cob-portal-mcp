import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig, type Me, PortalClient } from "./core.js";
import { createServer } from "./server.js";
import { ALL_TOOLS, visibleTools } from "./tools.js";

const KEY = "cob_secretvalue123456";
const ID = "11111111-1111-4111-8111-111111111111";

function meWith(scopes: string[]): Me {
	return {
		person: { name: "Asha", email: "asha@example.com" },
		key: { name: "agent", prefix: "cob_secret", scopes, expires_at: "2027-01-01T00:00:00Z" },
	};
}

interface Call {
	url: URL;
	method: string;
	headers: Record<string, string>;
	body: unknown;
}

function fakePortal(reply: (call: Call) => { status?: number; json: unknown }) {
	const calls: Call[] = [];
	const impl = (async (input: URL | string, init?: RequestInit) => {
		const call: Call = {
			url: new URL(String(input)),
			method: init?.method ?? "GET",
			headers: init?.headers as Record<string, string>,
			body: init?.body ? JSON.parse(String(init.body)) : undefined,
		};
		calls.push(call);
		const r = reply(call);
		return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
	}) as typeof fetch;
	return { calls, client: new PortalClient({ url: "https://portal.test", key: KEY, timeoutMs: 5000 }, impl) };
}

async function connect(scopes: string[], reply: Parameters<typeof fakePortal>[0] = () => ({ json: { ok: true } })) {
	const fake = fakePortal(reply);
	const { server, tools } = createServer(fake.client, meWith(scopes));
	const [a, b] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: "test", version: "0" });
	await Promise.all([server.connect(a), client.connect(b)]);
	return { client, calls: fake.calls, tools };
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0] as { text: string }).text;

describe("scope filtering", () => {
	it("offers only whoami to a key with no scope", async () => {
		const { client } = await connect([]);
		const names = (await client.listTools()).tools.map((t) => t.name);
		expect(names).toEqual(["whoami"]);
	});

	it("offers each tool when its scope is present", async () => {
		const { client } = await connect(["work:read", "work:draft", "work:comment", "checks:read"]);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(
			[
				"whoami",
				"list_tasks",
				"get_task",
				"list_templates",
				"get_check_results",
				"add_comment",
				"draft_tasks",
				"draft_checklist",
				"list_drafts",
				"get_draft",
			].sort(),
		);
	});

	it("hides the tools of a scope the key lacks", async () => {
		const { client } = await connect(["work:read"]);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(["get_task", "list_tasks", "list_templates", "whoami"]);
	});

	it("maps every tool to the documented scope", () => {
		const map = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.scope ?? null]));
		expect(map).toEqual({
			whoami: null,
			list_tasks: "work:read",
			get_task: "work:read",
			list_templates: "work:read",
			get_check_results: "checks:read",
			add_comment: "work:comment",
			draft_tasks: "work:draft",
			draft_checklist: "work:draft",
			list_drafts: "work:draft",
			get_draft: "work:draft",
		});
		expect(visibleTools(ALL_TOOLS, ["checks:read"]).map((t) => t.name)).toEqual(["whoami", "get_check_results"]);
	});
});

describe("requests", () => {
	it("sends the key only as a bearer header, never in the URL", async () => {
		const { client, calls } = await connect(["work:read"]);
		await client.callTool({ name: "list_tasks", arguments: { scope: "team", status: "live", limit: 5 } });
		const call = calls[0] as Call;
		expect(call.method).toBe("GET");
		expect(call.url.pathname).toBe("/api/v1/tasks");
		expect(call.url.searchParams.get("scope")).toBe("team");
		expect(call.url.searchParams.get("status")).toBe("live");
		expect(call.url.searchParams.get("limit")).toBe("5");
		expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
		expect(call.url.toString()).not.toContain(KEY);
		expect(call.headers["Idempotency-Key"]).toBeUndefined();
	});

	it("sends a new Idempotency-Key with each POST", async () => {
		const { client, calls } = await connect(["work:comment"]);
		await client.callTool({ name: "add_comment", arguments: { task_id: ID, body: "Looks good" } });
		await client.callTool({ name: "add_comment", arguments: { task_id: ID, body: "Looks good" } });
		const [a, b] = calls as [Call, Call];
		expect(a.method).toBe("POST");
		expect(a.url.pathname).toBe(`/api/v1/tasks/${ID}/comments`);
		expect(a.body).toEqual({ body: "Looks good" });
		expect(a.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
		expect(b.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
		expect(a.headers["Idempotency-Key"]).not.toBe(b.headers["Idempotency-Key"]);
	});

	it("sends a plan object, and parses a plan sent as text", async () => {
		const { client, calls } = await connect(["work:draft"]);
		const plan = { areas: [{ id: "A01", name: "Home", cases: [] }] };
		await client.callTool({ name: "draft_checklist", arguments: { plan, title: "Plan", priority: "high" } });
		await client.callTool({ name: "draft_checklist", arguments: { plan: JSON.stringify(plan) } });
		expect((calls[0] as Call).url.pathname).toBe("/api/v1/drafts");
		expect((calls[0] as Call).body).toMatchObject({ plan, title: "Plan", priority: "high" });
		expect((calls[1] as Call).body).toMatchObject({ plan });
	});

	it("reports plan text that is not JSON without calling the portal", async () => {
		const { client, calls } = await connect(["work:draft"]);
		const r = await client.callTool({ name: "draft_checklist", arguments: { plan: "{nope" } });
		expect(r.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});

	it("sends draft_tasks and reads a draft batch", async () => {
		const { client, calls } = await connect(["work:draft"]);
		await client.callTool({
			name: "draft_tasks",
			arguments: { title: "Batch", tasks: [{ title: "T1", templateKey: "bug" }] },
		});
		await client.callTool({ name: "get_draft", arguments: { batch_id: ID } });
		await client.callTool({ name: "list_drafts", arguments: {} });
		expect((calls[0] as Call).body).toEqual({ title: "Batch", tasks: [{ title: "T1", templateKey: "bug" }] });
		expect((calls[1] as Call).url.pathname).toBe(`/api/v1/drafts/${ID}`);
		expect((calls[2] as Call).url.pathname).toBe("/api/v1/drafts");
	});

	it("rejects an input that is not a uuid before any call", async () => {
		const { client, calls } = await connect(["work:read"]);
		const r = await client.callTool({ name: "get_task", arguments: { task_id: "nope" } });
		expect(r.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});
});

describe("error mapping", () => {
	const fail = (status: number, error: unknown) => () => ({ status, json: { error } });

	it("passes code, message and each details path to the agent", async () => {
		const { client } = await connect(
			["work:draft"],
			fail(400, {
				code: "bad_plan",
				message: "The plan has problems. Fix them and send it again.",
				details: [
					{ path: "plan.areas[0].cases[0].priority", message: "use high, medium or low" },
					{ path: "plan.areas[0].cases[1].device", message: "use phone, laptop or both" },
				],
			}),
		);
		const r = await client.callTool({ name: "draft_checklist", arguments: { plan: { areas: [] } } });
		expect(r.isError).toBe(true);
		const t = text(r);
		expect(t).toContain("bad_plan: The plan has problems.");
		expect(t).toContain("plan.areas[0].cases[0].priority: use high, medium or low");
		expect(t).toContain("plan.areas[0].cases[1].device: use phone, laptop or both");
	});

	it("adds a plain hint for 401, 403 and 429", async () => {
		const c401 = await connect(["work:read"], fail(401, { code: "invalid_key", message: "Bad key.", details: null }));
		expect(text(await c401.client.callTool({ name: "list_templates", arguments: {} }))).toContain("Profile page");

		const c403 = await connect(
			["work:read"],
			fail(403, { code: "missing_scope", message: "No scope.", details: null }),
		);
		expect(text(await c403.client.callTool({ name: "list_templates", arguments: {} }))).toContain("lacks a scope");

		const c429 = await connect(
			["work:read"],
			fail(429, { code: "rate_limited", message: "Too many.", details: { limit: 60 } }),
		);
		const t = text(await c429.client.callTool({ name: "list_templates", arguments: {} }));
		expect(t).toContain("rate_limited: Too many.");
		expect(t).toContain("Wait a minute");
	});

	it("never puts the key in an error text", async () => {
		const fake = fakePortal(() => ({
			status: 500,
			json: { error: { code: "boom", message: "Failed", details: null } },
		}));
		await expect(fake.client.get("/api/v1/me")).rejects.toThrow(/boom: Failed/);
		await expect(fake.client.get("/api/v1/me")).rejects.not.toThrow(new RegExp(KEY));
	});

	it("reports an unreachable portal in plain words", async () => {
		const client = new PortalClient({ url: "https://portal.test", key: KEY, timeoutMs: 5000 }, (async () => {
			throw new TypeError(`fetch failed for ${KEY}`);
		}) as typeof fetch);
		const err = await client.me().catch((e: Error) => e);
		expect((err as Error).message).toContain("Could not reach the portal");
		expect((err as Error).message).not.toContain(KEY);
	});
});

describe("prompt", () => {
	it("explains the plan format and the rules", async () => {
		const { client } = await connect(["work:draft"]);
		const list = await client.listPrompts();
		expect(list.prompts.map((p) => p.name)).toEqual(["write_test_plan"]);
		const p = await client.getPrompt({ name: "write_test_plan", arguments: { subject: "the login page" } });
		const t = ((p.messages[0] as { content: unknown }).content as { text: string }).text;
		for (const word of [
			"areas",
			"cases",
			"priority",
			"phone",
			"laptop",
			"both",
			"preconditions",
			"expected",
			"screenshot",
			"draft_checklist",
			"approves",
		]) {
			expect(t).toContain(word);
		}
		expect(t).toContain("the login page");
	});
});

describe("config", () => {
	it("reads the settings and trims the trailing slash", () => {
		const c = loadConfig({ COB_PORTAL_URL: "https://p.test/", COB_PORTAL_KEY: KEY, COB_PORTAL_TIMEOUT_MS: "4000" });
		expect(c).toEqual({ url: "https://p.test", key: KEY, timeoutMs: 4000 });
	});

	it("refuses a missing or wrong key and a bad timeout, without echoing the key", () => {
		expect(() => loadConfig({ COB_PORTAL_URL: "https://p.test" })).toThrow(/COB_PORTAL_KEY/);
		expect(() => loadConfig({ COB_PORTAL_URL: "https://p.test", COB_PORTAL_KEY: "wrongkeyvalue" })).toThrow(
			/starts with cob_/,
		);
		expect(() => loadConfig({ COB_PORTAL_KEY: KEY })).toThrow(/COB_PORTAL_URL/);
		expect(() =>
			loadConfig({ COB_PORTAL_URL: "https://p.test", COB_PORTAL_KEY: KEY, COB_PORTAL_TIMEOUT_MS: "5" }),
		).toThrow(/TIMEOUT/);
		try {
			loadConfig({ COB_PORTAL_URL: "https://p.test", COB_PORTAL_KEY: "wrongkeyvalue" });
		} catch (e) {
			expect((e as Error).message).not.toContain("wrongkeyvalue");
		}
	});
});
