import { z } from "zod";
import type { Me, PortalClient } from "./core.js";
import { PortalError } from "./core.js";

export type Scope = "work:read" | "work:draft" | "work:comment" | "checks:read" | "changes:read" | "changes:draft";

export interface ToolContext {
	client: PortalClient;
	me: Me;
}

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
	name: string;
	title: string;
	description: string;
	/** The scope the key needs. Absent: every key may use the tool. */
	scope?: Scope;
	write: boolean;
	input: Shape;
	handler: (input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}

// biome-ignore lint/suspicious/noExplicitAny: a list holds tools with different input shapes
export type AnyTool = ToolDef<any>;

function def<Shape extends z.ZodRawShape>(d: ToolDef<Shape>): ToolDef<Shape> {
	return d;
}

const uuid = z.string().uuid();

/** A plan can arrive as an object or as the JSON text of one. Models do both. */
function readPlan(plan: unknown): unknown {
	if (typeof plan !== "string") return plan;
	try {
		return JSON.parse(plan);
	} catch {
		throw new PortalError("plan is text but not valid JSON. Send the plan as a JSON object with an areas list.");
	}
}

/** A lean guided step. The portal checks the fields and checks with its own parser and names any problem by its path. */
const leanStep = z
	.object({
		key: z
			.string()
			.regex(/^[a-z][a-z0-9_]*$/)
			.optional()
			.describe("Small letters, numbers and underscores. Left out: s1, s2 ..."),
		title: z.string().min(1).describe("What the person does in this step."),
		why: z.string().optional().describe("One line: why this step."),
		how: z.string().optional().describe("How to do it: numbered lines (1. 2.), - lines and a Tip: line."),
		minutes: z.number().int().min(0).max(1440).optional().describe("The planned minutes of the step."),
		needs: z
			.array(z.string())
			.optional()
			.describe("The step keys this step waits for. Left out: the step before. Empty: any time."),
		confirm: z.boolean().optional().describe("The person presses Step done. A step with no fields gets it by itself."),
		fields: z
			.array(z.record(z.string(), z.unknown()))
			.optional()
			.describe("Answer fields: key, label, type, required."),
		checks: z
			.array(z.record(z.string(), z.unknown()))
			.optional()
			.describe("Hand-in checks: { field, atLeast | atMost | filled | files | links | startsWith, message }."),
		selfCheck: z.boolean().optional().describe("The person ticks the Done when lines here."),
	})
	.strict();

const draftTask = z
	.object({
		title: z.string().min(1).describe("The task title."),
		templateKey: z
			.string()
			.optional()
			.describe("The key of a published template (see list_templates). Use this or body."),
		body: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("A template body with steps and endings. Use this or templateKey."),
		notes: z.string().optional().describe("Used for the one-question task made when there is no template and no body."),
		priority: z.string().optional(),
		dueAt: z.string().optional().describe("ISO date and time."),
		parentId: uuid.optional().describe("Hang this draft under a task that already exists. Use this or parentRef."),
		ref: z
			.string()
			.min(1)
			.max(60)
			.optional()
			.describe(
				"A short name for this draft inside the batch, such as main-1. A later draft points at it with parentRef.",
			),
		parentRef: z
			.string()
			.min(1)
			.max(60)
			.optional()
			.describe(
				"The ref of an earlier draft in this batch: this draft becomes its sub-task. Put the main task before its sub-tasks.",
			),
		category: z
			.string()
			.min(1)
			.optional()
			.describe(
				"One of the portal's task categories (see list_categories). Left out: the template's, else the parent's.",
			),
		doneWhen: z
			.array(z.string().min(1))
			.max(20)
			.optional()
			.describe("What must be true when the task is done, one line each."),
		brief: z
			.object({
				why: z.string().min(1).optional().describe("Why this matters."),
				handIn: z.string().min(1).optional().describe("What the person hands in."),
				doneWhen: z
					.array(z.string().min(1))
					.max(20)
					.optional()
					.describe("Used as the task's Done when if doneWhen is empty."),
				readFirst: z
					.array(z.object({ label: z.string().min(1), url: z.string().min(1) }).strict())
					.max(20)
					.optional()
					.describe("Links to read before step 1."),
			})
			.strict()
			.optional()
			.describe("The brief of a guided task: why it matters, what is handed in, Done when, links to read first."),
		steps: z
			.array(leanStep)
			.min(1)
			.max(40)
			.optional()
			.describe(
				"Guided steps. With steps, the portal builds the body and notes becomes the brief's why. Use steps, body or templateKey.",
			),
		needsRefs: z
			.array(z.string().min(1).max(60))
			.max(20)
			.optional()
			.describe("The refs of other drafts in this batch that this task waits for."),
		needsIds: z.array(uuid).max(20).optional().describe("Ids of existing tasks in the team that this task waits for."),
		askTo: z.enum(["giver", "reviewer"]).optional().describe("Who answers the person's questions on this task."),
	})
	.strict();

const AREAS = [
	"settings",
	"job_roles",
	"people",
	"templates",
	"rounds",
	"stages",
	"leave_types",
	"holidays",
	"shifts",
	"patterns",
	"offices",
] as const;

/** The words every change tool tells the model. Nothing changes until a person approves the set in the portal. */
const FLOW =
	"This tool never changes the portal. A change is only drafted: nothing changes until a person approves it on " +
	"Changes to review in the portal.";

const NOT_READY = "This part of the portal cannot be changed by draft yet.";

/** A 404 not_ready from the portal means the area has no draft support yet: say so in plain words. */
async function readyOr<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof PortalError && e.status === 404 && /not_ready/.test(e.message))
			throw new PortalError(NOT_READY, 404);
		throw e;
	}
}

type StateQuery = Record<string, string | number | undefined>;

function stateTool(
	name: string,
	title: string,
	what: string,
	area: string,
	input: z.ZodRawShape = {},
	query: (i: Record<string, unknown>) => StateQuery = () => ({}),
): AnyTool {
	return def({
		name,
		title,
		description: `Read the current ${what} of the portal, to see what is there before you draft a change (read first, then call draft_changes). ${FLOW}`,
		scope: "changes:read",
		write: false,
		input,
		handler: (i, ctx) => readyOr(() => ctx.client.get(`/api/v1/state/${area}`, query(i as Record<string, unknown>))),
	});
}

const draftItem = z
	.object({
		area: z.enum(AREAS).describe("The part of the portal. Call list_change_areas to see which are open to you."),
		kind: z
			.enum(["create", "update", "archive", "restore", "move"])
			.describe("What happens. Each area allows some kinds only (see list_change_areas)."),
		target: z
			.string()
			.min(1)
			.optional()
			.describe("The id of the row, or the setting key. Left out for create. Copy it from the read tools."),
		after: z
			.unknown()
			.describe(
				"The new value, in the shape list_change_areas shows for this area and kind. For a setting: the value.",
			),
		reason: z.string().trim().min(1).describe("Why this change, in one plain sentence. Every item needs one."),
	})
	.strict();

export const ALL_TOOLS: AnyTool[] = [
	def({
		name: "whoami",
		title: "Who am I",
		description: "Show the person this key acts as, the key name, its scopes and when it ends.",
		write: false,
		input: {},
		handler: async (_i, ctx) => ctx.me,
	}),
	def({
		name: "list_tasks",
		title: "List tasks",
		description:
			"List tasks. scope mine: tasks given to the key's person. scope team: the team's tasks (needs the right to see team work).",
		scope: "work:read",
		write: false,
		input: {
			scope: z.enum(["mine", "team"]).optional().describe("Default mine."),
			status: z
				.enum(["live", "open", "working", "paused", "ended", "cancelled"])
				.optional()
				.describe("live means open, working or paused."),
			limit: z.number().int().min(1).optional(),
			category: z
				.string()
				.min(1)
				.optional()
				.describe("Only tasks of this category (see list_categories). none: tasks without a category."),
			parent_id: uuid.optional().describe("Only the sub-tasks of this task."),
		},
		handler: (i, ctx) =>
			ctx.client.get("/api/v1/tasks", {
				scope: i.scope,
				status: i.status,
				limit: i.limit,
				category: i.category,
				parentId: i.parent_id,
			}),
	}),
	def({
		name: "list_categories",
		title: "List task categories",
		description: "List the task categories the portal offers. Use one of them as the category of a draft task.",
		scope: "work:read",
		write: false,
		input: {},
		handler: (_i, ctx) => ctx.client.get("/api/v1/categories"),
	}),
	def({
		name: "get_task",
		title: "Get a task",
		description:
			"Read one task: its brief, steps (state, planned and spent minutes), progress, what it waits for, answers and notes.",
		scope: "work:read",
		write: false,
		input: { task_id: uuid.describe("The task id from list_tasks.") },
		handler: (i, ctx) => ctx.client.get(`/api/v1/tasks/${i.task_id}`),
	}),
	def({
		name: "list_templates",
		title: "List task templates",
		description: "List the published task templates. A draft task can name one with templateKey.",
		scope: "work:read",
		write: false,
		input: {},
		handler: (_i, ctx) => ctx.client.get("/api/v1/templates"),
	}),
	def({
		name: "get_check_results",
		title: "Get check results",
		description:
			"Read the test runs and skips of a check list task, with progress. Screenshot names only, never the files.",
		scope: "checks:read",
		write: false,
		input: { task_id: uuid.describe("The task id of a check list task.") },
		handler: (i, ctx) => ctx.client.get(`/api/v1/tasks/${i.task_id}/checks`),
	}),
	def({
		name: "add_comment",
		title: "Add a note to a task",
		description: "Write a note on a task. The note is marked as written through this key.",
		scope: "work:comment",
		write: true,
		input: { task_id: uuid, body: z.string().trim().min(1).describe("The note text.") },
		handler: (i, ctx) => ctx.client.post(`/api/v1/tasks/${i.task_id}/comments`, { body: i.body }),
	}),
	def({
		name: "draft_tasks",
		title: "Send draft tasks",
		description:
			"Send a batch of draft tasks. A batch can hold a main task with its sub-tasks: give the main task a ref and each " +
			"sub-task parentRef (the main task comes first). Read the plan_growth_work prompt for a plan. " +
			"A person must approve them in the portal before they become tasks, and decides who gets them. " +
			"The key never assigns work.",
		scope: "work:draft",
		write: true,
		input: {
			title: z.string().min(1).describe("The title of the batch."),
			tasks: z.array(draftTask).min(1).describe("The draft tasks."),
		},
		handler: (i, ctx) => ctx.client.post("/api/v1/drafts", { title: i.title, tasks: i.tasks }),
	}),
	def({
		name: "draft_checklist",
		title: "Send a test plan as a check list draft",
		description:
			"Send a test plan (the plan JSON: areas, cases) as one draft task with a check list. A person must approve it " +
			"in the portal. Read the write_test_plan prompt first. If the portal finds problems, it lists each with its " +
			"path; fix them and send the whole plan again.",
		scope: "work:draft",
		write: true,
		input: {
			plan: z
				.union([z.record(z.string(), z.unknown()), z.string()])
				.describe(
					"The plan JSON: { project?, areas: [{ id, name, summary?, cases: [...] }] }. Text of the JSON is also accepted.",
				),
			title: z.string().optional().describe("The batch title. Default: the plan's project name."),
			priority: z.string().optional(),
			dueAt: z.string().optional().describe("ISO date and time."),
		},
		handler: (i, ctx) =>
			ctx.client.post("/api/v1/drafts", {
				plan: readPlan(i.plan),
				title: i.title,
				priority: i.priority,
				dueAt: i.dueAt,
			}),
	}),
	def({
		name: "list_drafts",
		title: "List my draft batches",
		description:
			"List the draft batches this key's person sent, newest first, with how many wait, are approved or rejected.",
		scope: "work:draft",
		write: false,
		input: {},
		handler: (_i, ctx) => ctx.client.get("/api/v1/drafts"),
	}),
	def({
		name: "get_draft",
		title: "Get a draft batch",
		description: "Read one draft batch and its drafts, with the state and reason of each.",
		scope: "work:draft",
		write: false,
		input: { batch_id: uuid.describe("The batch_id from draft_tasks, draft_checklist or list_drafts.") },
		handler: (i, ctx) => ctx.client.get(`/api/v1/drafts/${i.batch_id}`),
	}),
	def({
		name: "list_change_areas",
		title: "List the areas you can draft changes for",
		description:
			"List every part of the portal this key can draft changes for: its key, label, the kinds (create, update, archive, " +
			"restore, move), the shape of `after` for each kind and examples. Call this first, then read the current state with " +
			"the read_* tools, then call draft_changes. " +
			FLOW +
			" Money, the admin account and executive roles cannot be drafted.",
		scope: "changes:read",
		write: false,
		input: {},
		handler: (_i, ctx) => ctx.client.get("/api/v1/changes/areas"),
	}),
	stateTool(
		"read_settings",
		"Read portal settings",
		"settings",
		"settings",
		{
			group: z.string().min(1).optional().describe("Only this settings group, for example attendance."),
			search: z.string().min(1).optional().describe("Words to find in the setting key or its description."),
			changed_only: z.boolean().optional().describe("Only settings that differ from the built-in value."),
		},
		(i) => ({
			group: i.group as string | undefined,
			q: i.search as string | undefined,
			changed: i.changed_only ? 1 : undefined,
		}),
	),
	stateTool("read_job_roles", "Read job roles", "job roles with their responsibilities", "job_roles"),
	stateTool(
		"read_people",
		"Read people and their roles",
		"people: name, id, main job role, extra job roles, responsibilities, designation and manager",
		"people",
		{
			person: z.string().min(1).optional().describe("One person: the id, from an earlier read."),
			search: z.string().min(1).optional().describe("Part of a name."),
		},
		(i) => ({ person: i.person as string | undefined, q: i.search as string | undefined }),
	),
	stateTool("read_rounds", "Read hiring rounds", "hiring rounds", "rounds"),
	stateTool("read_leave_types", "Read leave types", "leave types", "leave_types"),
	stateTool(
		"read_holidays",
		"Read holidays",
		"holidays",
		"holidays",
		{ year: z.number().int().min(2000).max(2100).optional().describe("The year. Left out: this year.") },
		(i) => ({ year: i.year as number | undefined }),
	),
	def({
		name: "read_shifts",
		title: "Read shifts and patterns",
		description:
			"Read the current shifts and the shift patterns of the portal, to see what is there before you draft a change " +
			"(read first, then call draft_changes). " +
			FLOW,
		scope: "changes:read",
		write: false,
		input: {},
		handler: (_i, ctx) =>
			readyOr(async () => {
				const [shifts, patterns] = await Promise.all([
					ctx.client.get("/api/v1/state/shifts"),
					ctx.client.get("/api/v1/state/patterns"),
				]);
				return { shifts, patterns };
			}),
	}),
	def({
		name: "read_checkin_places",
		title: "Read offices and check-in places",
		description:
			"Read the offices and the check-in place settings (attendance settings that start with checkin_). Read first, " +
			"then call draft_changes. " +
			FLOW,
		scope: "changes:read",
		write: false,
		input: {},
		handler: (_i, ctx) =>
			readyOr(async () => {
				const [offices, settings] = await Promise.all([
					ctx.client.get("/api/v1/state/offices"),
					ctx.client.get("/api/v1/state/settings", { group: "attendance", q: "checkin_" }),
				]);
				return { offices, settings };
			}),
	}),
	stateTool("read_templates_full", "Read task templates in full", "task templates with their repeats", "templates"),
	def({
		name: "draft_changes",
		title: "Draft a change set for approval",
		description:
			"Draft one change set: a title, a reason and a list of items, each with area, kind, target, after and its own " +
			"reason. Read the current state first (list_change_areas and the read_* tools). Make one set for each topic, for " +
			"example one set for 'Roles for Ravi and Neha'. Every item needs a reason. " +
			"Nothing changes now: the set waits on Changes to review in the portal, where a person approves or rejects each " +
			"item, and can undo an applied one. Tell the person to open Changes to review, and show them the lines the portal " +
			"returned. Money, the admin account, executive roles and the settings groups the admin blocked are refused: tell " +
			"the person to change those in the portal itself. If the portal lists problems, each has a path: fix them and " +
			"send the set again.",
		scope: "changes:draft",
		write: true,
		input: {
			title: z.string().trim().min(1).describe("A short title, such as 'Extra roles for Ravi and Neha'."),
			reason: z.string().trim().min(1).describe("Why the person asked for this."),
			items: z.array(draftItem).min(1).describe("The changes of this set."),
		},
		handler: (i, ctx) =>
			readyOr(() => ctx.client.post("/api/v1/changes", { title: i.title, reason: i.reason, items: i.items })),
	}),
	def({
		name: "get_change_set",
		title: "Get a change set",
		description:
			"Read one change set you drafted: its items, the plain lines of each, the status of each (waiting, applied, " +
			"rejected, conflict, failed, undone) and any error. Use it to tell the person what happened after they reviewed it.",
		scope: "changes:draft",
		write: false,
		input: { set_id: uuid.describe("The set_id from draft_changes or list_change_sets.") },
		handler: (i, ctx) => readyOr(() => ctx.client.get(`/api/v1/changes/${i.set_id}`)),
	}),
	def({
		name: "list_change_sets",
		title: "List my change sets",
		description: "List the change sets this key's person drafted, newest first, with the status of each.",
		scope: "changes:draft",
		write: false,
		input: {},
		handler: (_i, ctx) => readyOr(() => ctx.client.get("/api/v1/changes")),
	}),
	def({
		name: "withdraw_change_set",
		title: "Withdraw a waiting change set",
		description:
			"Withdraw a change set you drafted that still waits for review, for example when the person changed their mind. " +
			"It changes nothing in the portal set-up. A set that a person already decided cannot be withdrawn.",
		scope: "changes:draft",
		write: true,
		input: { set_id: uuid.describe("The set_id of a waiting set.") },
		handler: (i, ctx) => readyOr(() => ctx.client.post(`/api/v1/changes/${i.set_id}/withdraw`, {})),
	}),
];

/** The tools whose scope the key has. A tool without a scope is always offered. */
export function visibleTools(tools: readonly AnyTool[], scopes: readonly string[]): AnyTool[] {
	return tools.filter((t) => !t.scope || scopes.includes(t.scope));
}
