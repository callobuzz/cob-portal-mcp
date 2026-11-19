import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Settings, the HTTP client and the error text. The key goes out only as an Authorization header.
 * It is never put in a URL, an error message or a log line.
 */
declare const VERSION = "0.7.0";
declare class PortalError extends Error {
    readonly status?: number | undefined;
    constructor(message: string, status?: number | undefined);
}
interface Config {
    url: string;
    key: string;
    timeoutMs: number;
}
/** Reads COB_PORTAL_URL, COB_PORTAL_KEY and the optional COB_PORTAL_TIMEOUT_MS. */
declare function loadConfig(env?: NodeJS.ProcessEnv): Config;
interface Me {
    person: {
        name: string;
        email: string;
    };
    key: {
        name: string;
        prefix: string;
        scopes: string[];
        expires_at: string;
    };
}
/** The text an agent reads when the portal answers with an error. It keeps the code, the message and every details path. */
declare function errorFromResponse(status: number, body: unknown): PortalError;
type Query = Record<string, string | number | undefined>;
declare class PortalClient {
    private readonly config;
    private readonly fetchImpl;
    constructor(config: Config, fetchImpl?: typeof fetch);
    private send;
    get<T = unknown>(path: string, query?: Query): Promise<T>;
    post<T = unknown>(path: string, body: unknown): Promise<T>;
    me(): Promise<Me>;
}

/** The text of the plan_growth_work prompt: how to send a main task with its sub-tasks as one draft batch. */
declare function growthPlanPrompt(goal: string, category: string): string;
/** The text of the write_test_plan prompt: the plan JSON format and the rules for writing it. */
declare function testPlanPrompt(subject: string): string;

type Scope = "work:read" | "work:draft" | "work:comment" | "checks:read" | "changes:read" | "changes:draft" | "records:read";
interface ToolContext {
    client: PortalClient;
    me: Me;
}
interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
    name: string;
    title: string;
    description: string;
    /** The scope the key needs. Absent: every key may use the tool. */
    scope?: Scope;
    write: boolean;
    input: Shape;
    handler: (input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}
type AnyTool = ToolDef<any>;
declare const ALL_TOOLS: AnyTool[];
/** The tools whose scope the key has. A tool without a scope is always offered. */
declare function visibleTools(tools: readonly AnyTool[], scopes: readonly string[]): AnyTool[];

interface CreatedServer {
    server: McpServer;
    tools: AnyTool[];
}
/** Builds the MCP server for one key. The key's scopes (from /api/v1/me) decide which tools exist. */
declare function createServer(client: PortalClient, me: Me, allTools?: readonly AnyTool[]): CreatedServer;

export { ALL_TOOLS, type AnyTool, type Config, type Me, PortalClient, PortalError, type Scope, type ToolDef, VERSION, createServer, errorFromResponse, growthPlanPrompt, loadConfig, testPlanPrompt, visibleTools };
