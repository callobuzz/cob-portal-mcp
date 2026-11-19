import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig, type Me, PortalClient } from "./core.js";
import { createServer } from "./server.js";
import { ALL_TOOLS, visibleTools } from "./tools.js";

const KEY = "cob_test_key_not_real";
const ID = "11111111-1111-4111-8111-111111111111";

function meWith(scopes: string[]): Me {
	return {
		person: { name: "Asha", email: "asha@example.com" },
		key: { name: "agent", prefix: "cob_test_k", scopes, expires_at: "2027-01-01T00:00:00Z" },
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

const CHANGE_READ = [
	"list_change_areas",
	"read_settings",
	"read_job_roles",
	"read_people",
	"read_rounds",
	"read_leave_types",
	"read_leave_policies",
	"read_offers",
	"read_offer_templates",
	"read_holidays",
	"read_shifts",
	"read_checkin_places",
	"read_templates_full",
	"read_access_roles",
	"read_access_presets",
	"read_person_access",
	"read_access_holders",
	"read_worktime_rules",
	"read_departments",
	"read_grades",
	"read_role_changes",
	"read_day_windows",
	"read_new_person_choices",
];
const RECORD_READ = [
	"read_worktime_weeks",
	"read_worktime_cards",
	"read_worktime_month",
	"read_past_days",
	"read_no_window_people",
	"read_candidates",
	"read_applications",
	"read_leave_balances",
	"read_leave_requests",
	"read_attendance_days",
	"read_checkins",
	"read_roster_days",
	"read_pay_runs",
	"read_salary_structures",
	"read_presence",
	"read_tests",
	"read_targets",
	"read_letters",
	"read_documents",
];
const CHANGE_DRAFT = ["draft_changes", "get_change_set", "list_change_sets", "withdraw_change_set"];

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
				"list_categories",
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
		expect(names).toEqual(["get_task", "list_categories", "list_tasks", "list_templates", "whoami"]);
	});

	it("maps every tool to the documented scope", () => {
		const map = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t.scope ?? null]));
		expect(map).toEqual({
			whoami: null,
			list_tasks: "work:read",
			get_task: "work:read",
			list_templates: "work:read",
			list_categories: "work:read",
			get_check_results: "checks:read",
			add_comment: "work:comment",
			draft_tasks: "work:draft",
			draft_checklist: "work:draft",
			list_drafts: "work:draft",
			get_draft: "work:draft",
			...Object.fromEntries(CHANGE_READ.map((n) => [n, "changes:read"])),
			...Object.fromEntries(CHANGE_DRAFT.map((n) => [n, "changes:draft"])),
			...Object.fromEntries(RECORD_READ.map((n) => [n, "records:read"])),
		});
		expect(visibleTools(ALL_TOOLS, ["checks:read"]).map((t) => t.name)).toEqual(["whoami", "get_check_results"]);
	});
});

describe("change tools (M26)", () => {
	it("show only with their scopes", async () => {
		const none = await connect(["work:read", "work:draft", "work:comment", "checks:read"]);
		const noneNames = (await none.client.listTools()).tools.map((t) => t.name);
		for (const n of [...CHANGE_READ, ...CHANGE_DRAFT]) expect(noneNames).not.toContain(n);

		const read = await connect(["changes:read"]);
		expect((await read.client.listTools()).tools.map((t) => t.name).sort()).toEqual(["whoami", ...CHANGE_READ].sort());

		const draft = await connect(["changes:draft"]);
		expect((await draft.client.listTools()).tools.map((t) => t.name).sort()).toEqual(
			["whoami", ...CHANGE_DRAFT].sort(),
		);
	});

	it("records:read offers only the record tools, and each one reads a page", async () => {
		const { client } = await connect(["records:read"]);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(["whoami", ...RECORD_READ].sort());
		for (const n of RECORD_READ) {
			const t = ALL_TOOLS.find((x) => x.name === n);
			expect(t?.description).toContain("Answers one page");
			expect(t?.write).toBe(false);
		}
	});

	it("has no tool that approves, applies or undoes, and every description says a person approves", () => {
		for (const t of ALL_TOOLS) expect(t.name).not.toMatch(/approve|apply|undo/);
		const draft = ALL_TOOLS.find((t) => t.name === "draft_changes");
		expect(draft?.scope).toBe("changes:draft");
		expect(draft?.description).toContain("Changes to review");
		expect(draft?.description).toContain("Nothing changes now");
		for (const n of CHANGE_READ) {
			const t = ALL_TOOLS.find((x) => x.name === n);
			expect(t?.write).toBe(false);
			expect(t?.description).toContain("Changes to review");
		}
	});

	it("draft_changes posts the body as given, with a new Idempotency-Key", async () => {
		const { client, calls } = await connect(["changes:draft"], () => ({
			status: 201,
			json: { set_id: ID, status: "draft", items: [{ seq: 1, lines: ["Notice period: 30 days to 45 days"] }] },
		}));
		const body = {
			title: "Notice period",
			reason: "SV asked",
			items: [
				{ area: "settings", kind: "update", target: "hr.notice_days", after: 45, reason: "Longer hand-over" },
				{ area: "people", kind: "update", target: ID, after: { extraRoles: ["a"] }, reason: "Covers sales" },
			],
		};
		const r = await client.callTool({ name: "draft_changes", arguments: body });
		expect(r.isError).toBeFalsy();
		const c = calls[0] as Call;
		expect(c.method).toBe("POST");
		expect(c.url.pathname).toBe("/api/v1/changes");
		expect(c.body).toEqual(body);
		expect(c.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
	});

	it("draft_changes passes ref and $ref: values through as given (one set, in order)", async () => {
		const { client, calls } = await connect(["changes:draft"], () => ({
			status: 201,
			json: { set_id: ID, status: "draft", items: [] },
		}));
		const body = {
			title: "Onboard Asha",
			reason: "SV asked",
			items: [
				{ area: "departments", kind: "create", ref: "ops", after: { name: "Operations" }, reason: "New team" },
				{ area: "departments", kind: "create", after: { name: "Support", parent: "$ref:ops" }, reason: "Its team" },
				{ area: "people", kind: "update", target: "$ref:asha", after: { department: "$ref:ops" }, reason: "Her team" },
			],
		};
		const r = await client.callTool({ name: "draft_changes", arguments: body });
		expect(r.isError).toBeFalsy();
		expect((calls[0] as Call).body).toEqual(body);
		const bad = await client.callTool({
			name: "draft_changes",
			arguments: {
				title: "T",
				reason: "R",
				items: [{ area: "departments", kind: "create", ref: "1 bad", after: {}, reason: "r" }],
			},
		});
		expect(bad.isError).toBe(true);
		expect(calls).toHaveLength(1);
	});

	it("refuses an item with no reason or an unknown area before any call", async () => {
		const { client, calls } = await connect(["changes:draft"]);
		const noReason = await client.callTool({
			name: "draft_changes",
			arguments: { title: "T", reason: "R", items: [{ area: "settings", kind: "update", target: "x", after: 1 }] },
		});
		const badArea = await client.callTool({
			name: "draft_changes",
			arguments: { title: "T", reason: "R", items: [{ area: "pay", kind: "update", after: 1, reason: "r" }] },
		});
		expect(noReason.isError).toBe(true);
		expect(badArea.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});

	it("get_change_set, list_change_sets and withdraw_change_set call the set routes", async () => {
		const { client, calls } = await connect(["changes:draft"]);
		await client.callTool({ name: "get_change_set", arguments: { set_id: ID } });
		await client.callTool({ name: "list_change_sets", arguments: {} });
		await client.callTool({ name: "withdraw_change_set", arguments: { set_id: ID } });
		expect((calls[0] as Call).method).toBe("GET");
		expect((calls[0] as Call).url.pathname).toBe(`/api/v1/changes/${ID}`);
		expect((calls[1] as Call).url.pathname).toBe("/api/v1/changes");
		expect((calls[2] as Call).method).toBe("POST");
		expect((calls[2] as Call).url.pathname).toBe(`/api/v1/changes/${ID}/withdraw`);
	});

	it("read tools call the state routes with the right query", async () => {
		const { client, calls } = await connect(["changes:read"]);
		await client.callTool({ name: "list_change_areas", arguments: {} });
		await client.callTool({
			name: "read_settings",
			arguments: { group: "attendance", search: "grace", changed_only: true },
		});
		await client.callTool({ name: "read_people", arguments: { search: "Ravi" } });
		await client.callTool({ name: "read_holidays", arguments: { year: 2027 } });
		await client.callTool({ name: "read_shifts", arguments: {} });
		await client.callTool({ name: "read_checkin_places", arguments: {} });
		await client.callTool({ name: "read_offers", arguments: { person: "a@b.c" } });
		await client.callTool({ name: "read_offer_templates", arguments: {} });
		await client.callTool({ name: "read_access_holders", arguments: { code: "hiring:view" } });
		const paths = calls.map((c) => c.url.pathname);
		expect(paths[0]).toBe("/api/v1/changes/areas");
		expect(paths[1]).toBe("/api/v1/state/settings");
		const s = (calls[1] as Call).url.searchParams;
		expect([s.get("group"), s.get("q"), s.get("changed")]).toEqual(["attendance", "grace", "1"]);
		expect((calls[2] as Call).url.searchParams.get("q")).toBe("Ravi");
		expect((calls[3] as Call).url.searchParams.get("year")).toBe("2027");
		expect(paths).toContain("/api/v1/state/shifts");
		expect(paths).toContain("/api/v1/state/patterns");
		expect(paths).toContain("/api/v1/state/offices");
		const offerCalls = calls.filter((c) => c.url.pathname === "/api/v1/state/offers");
		expect(offerCalls).toHaveLength(1);
		expect((offerCalls[0] as Call).url.searchParams.get("person")).toBe("a@b.c");
		expect(paths).toContain("/api/v1/state/offer_templates");
		const accessCalls = calls.filter((c) => c.url.pathname === "/api/v1/state/person_access");
		expect(accessCalls).toHaveLength(1);
		expect((accessCalls[0] as Call).url.pathname + (accessCalls[0] as Call).url.search).toBe(
			"/api/v1/state/person_access?code=hiring%3Aview",
		);
		for (const c of calls) expect(c.method).toBe("GET");
	});

	it("read_settings with no filter is refused with the hint, and all: true reads every setting (dress rehearsal)", async () => {
		const { client, calls } = await connect(["changes:read"]);
		const r = await client.callTool({ name: "read_settings", arguments: {} });
		expect(r.isError).toBe(true);
		expect(text(r)).toContain("Pass a group");
		expect(calls).toHaveLength(0);
		await client.callTool({ name: "read_settings", arguments: { all: true } });
		await client.callTool({ name: "read_settings", arguments: { search: "worktime.pay" } });
		expect(calls.map((c) => c.url.pathname)).toEqual(["/api/v1/state/settings", "/api/v1/state/settings"]);
		expect((calls[1] as Call).url.searchParams.get("q")).toBe("worktime.pay");
	});

	it("the change tools say what an agent needs: manager, minutes, startsOn or fromJoiningDay, day targets, read_shifts, the limit, the admin-only areas", async () => {
		const { client } = await connect(["changes:draft", "changes:read"]);
		const { tools } = await client.listTools();
		for (const name of ["list_change_areas", "draft_changes"]) {
			const d = tools.find((t) => t.name === name)?.description ?? "";
			for (const w of [
				"manager",
				"designation, department and grade only",
				"breakMin, halfDayMin, fullDayMin, overtimeAfterMin and overtimeRoundMin, all in minutes",
				"fromJoiningDay",
				"startsOn",
				"$ref:<name>|YYYY-MM-DD",
				"read_shifts",
				"60",
				"people_add, past_days and salary_structures",
			]) {
				expect(d, `${name}: ${w}`).toContain(w);
			}
			expect(d).not.toContain("read_roster_plans");
			expect(d).not.toContain("—");
		}
	});

	it("turns a 404 not_ready into plain words", async () => {
		const { client } = await connect(["changes:read"], () => ({
			status: 404,
			json: { error: { code: "not_ready", message: "This area is not ready yet", details: null } },
		}));
		const r = await client.callTool({ name: "read_rounds", arguments: {} });
		expect(r.isError).toBe(true);
		expect(text(r)).toBe("This part of the portal cannot be changed by draft yet.");
	});

	it("the change_portal prompt tells the flow", async () => {
		const { client } = await connect(["changes:draft"]);
		const p = await client.getPrompt({ name: "change_portal", arguments: { what: "give Ravi a second role" } });
		const t = ((p.messages[0] as { content: unknown }).content as { text: string }).text;
		for (const w of [
			"Read first",
			"draft_changes",
			"Changes to review",
			"one set for each topic",
			"give Ravi a second role",
		]) {
			expect(t).toContain(w);
		}
		expect(t).not.toContain("—");
	});
});

describe("requests", () => {
	it("refuses a web page in place of API data, in plain words", async () => {
		const page = (async () => new Response("<!doctype html><title>Sign in</title>", { status: 200 })) as typeof fetch;
		const portal = new PortalClient({ url: "https://portal.test", key: KEY, timeoutMs: 5000 }, page);
		await expect(portal.me()).rejects.toThrow(/did not answer with API data/);
	});

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

	it("sends a main task with its sub-tasks (ref, parentRef, category, doneWhen) as one batch", async () => {
		const { client, calls } = await connect(["work:draft"], () => ({
			status: 201,
			json: { batch_id: ID, task_ids: [ID, ID], status: "pending" },
		}));
		const tasks = [
			{
				ref: "proof",
				title: "2. Proof assets",
				category: "Marketing and business growth",
				notes: "Make the proof a US buyer looks for.",
				doneWhen: ["Three case studies are live."],
			},
			{ parentRef: "proof", title: "Write three case studies", doneWhen: ["Each has three screenshots."] },
		];
		const r = await client.callTool({ name: "draft_tasks", arguments: { title: "Growth", tasks } });
		expect(r.isError).toBeFalsy();
		expect((calls[0] as Call).body).toEqual({ title: "Growth", tasks });
		expect(JSON.parse(text(r))).toMatchObject({ batch_id: ID, status: "pending" });
	});

	it("sends a guided draft (brief, steps with how and minutes, needs) as it is", async () => {
		const { client, calls } = await connect(["work:draft"], () => ({
			status: 201,
			json: { batch_id: ID, task_ids: [ID, ID], status: "pending" },
		}));
		const tasks = [
			{
				ref: "agencies",
				title: "Research US agencies",
				brief: { why: "Agencies give steady work.", handIn: "A sheet of 30 agencies." },
				steps: [
					{ key: "read", title: "Read the brief", minutes: 5, needs: [] },
					{
						key: "find",
						title: "Find 30 agencies",
						how: "1. Open Clutch.\n2. Filter by size.",
						minutes: 45,
						fields: [{ key: "rows", label: "How many agencies?", type: "number", required: true }],
						checks: [{ field: "rows", atLeast: 30, message: "Step done needs 30 agencies." }],
					},
				],
			},
			{ title: "Write the offer ladder", needsRefs: ["agencies"], needsIds: [ID], askTo: "reviewer" },
		];
		const r = await client.callTool({ name: "draft_tasks", arguments: { title: "Guided", tasks } });
		expect(r.isError).toBeFalsy();
		expect((calls[0] as Call).body).toEqual({ title: "Guided", tasks });
	});

	it("refuses a guided step with an unknown key before any call", async () => {
		const { client, calls } = await connect(["work:draft"]);
		const r = await client.callTool({
			name: "draft_tasks",
			arguments: { title: "B", tasks: [{ title: "T", steps: [{ title: "S", assignee: "x" }] }] },
		});
		expect(r.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});

	it("refuses an unknown field on a draft before any call", async () => {
		const { client, calls } = await connect(["work:draft"]);
		const r = await client.callTool({
			name: "draft_tasks",
			arguments: { title: "B", tasks: [{ title: "T", assignee: "someone" }] },
		});
		expect(r.isError).toBe(true);
		expect(calls).toHaveLength(0);
	});

	it("filters list_tasks by category and parent, and lists the categories", async () => {
		const { client, calls } = await connect(["work:read"]);
		await client.callTool({
			name: "list_tasks",
			arguments: { scope: "team", category: "Marketing and business growth", parent_id: ID },
		});
		await client.callTool({ name: "list_categories", arguments: {} });
		const a = calls[0] as Call;
		expect(a.url.searchParams.get("category")).toBe("Marketing and business growth");
		expect(a.url.searchParams.get("parentId")).toBe(ID);
		expect((calls[1] as Call).url.pathname).toBe("/api/v1/categories");
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

	it("an admin-only refusal (never_in_draft) never sends the agent to make a new key", async () => {
		const c = await connect(
			["changes:draft"],
			fail(403, { code: "never_in_draft", message: "Only the admin's key can draft this.", details: null }),
		);
		const t = text(
			await c.client.callTool({
				name: "draft_changes",
				arguments: { title: "x", reason: "y", items: [{ area: "people_add", kind: "create", after: {}, reason: "z" }] },
			}),
		);
		expect(t).toContain("never_in_draft: Only the admin's key can draft this.");
		expect(t).not.toContain("lacks a scope");
		expect(t).toContain("No new key or scope changes this");
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
		expect(list.prompts.map((p) => p.name)).toEqual(["write_test_plan", "plan_growth_work", "change_portal"]);
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

	it("explains a main task with sub-tasks in the portal's words", async () => {
		const { client } = await connect(["work:draft"]);
		const p = await client.getPrompt({
			name: "plan_growth_work",
			arguments: { goal: "win long-term US clients", category: "Sales" },
		});
		const t = ((p.messages[0] as { content: unknown }).content as { text: string }).text;
		for (const word of [
			"ref",
			"parentRef",
			"parentId",
			"category",
			"doneWhen",
			"draft_tasks",
			"list_categories",
			"list_tasks",
			"brief",
			"steps",
			"how",
			"minutes",
			"needsRefs",
			"needsIds",
		]) {
			expect(t).toContain(word);
		}
		expect(t).toContain("win long-term US clients");
		expect(t).toContain("Category: Sales");
		expect(t).toContain("never assigns");
		expect(t).not.toContain("—");
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

	it("sends the key over https only; plain http only to this computer", () => {
		expect(() => loadConfig({ COB_PORTAL_URL: "http://portal.example.com", COB_PORTAL_KEY: KEY })).toThrow(/https/);
		expect(() => loadConfig({ COB_PORTAL_URL: "ftp://portal.example.com", COB_PORTAL_KEY: KEY })).toThrow(/https/);
		expect(() => loadConfig({ COB_PORTAL_URL: "portal.example.com", COB_PORTAL_KEY: KEY })).toThrow(/web address/);
		for (const local of ["http://localhost:3500", "http://127.0.0.1:3500", "http://[::1]:3500"]) {
			expect(loadConfig({ COB_PORTAL_URL: local, COB_PORTAL_KEY: KEY }).url).toBe(local);
		}
	});
});

describe("redirects", () => {
	it("never follows a redirect, so the key is not sent on, and says so in plain words", async () => {
		const seen: RequestInit[] = [];
		const redirect = (async (_u: URL, init: RequestInit) => {
			seen.push(init);
			return new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/login" } });
		}) as unknown as typeof fetch;
		const portal = new PortalClient({ url: "https://portal.test", key: KEY, timeoutMs: 5000 }, redirect);
		await expect(portal.me()).rejects.toThrow(/sent a redirect/);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.redirect).toBe("manual");
	});
});
