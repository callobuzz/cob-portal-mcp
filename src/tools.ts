import { z } from "zod";
import type { Me, PortalClient } from "./core.js";
import { PortalError } from "./core.js";

export type Scope = "work:read" | "work:draft" | "work:comment" | "checks:read";

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
];

/** The tools whose scope the key has. A tool without a scope is always offered. */
export function visibleTools(tools: readonly AnyTool[], scopes: readonly string[]): AnyTool[] {
	return tools.filter((t) => !t.scope || scopes.includes(t.scope));
}
