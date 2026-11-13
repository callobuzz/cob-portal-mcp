/**
 * Settings, the HTTP client and the error text. The key goes out only as an Authorization header.
 * It is never put in a URL, an error message or a log line.
 */

import { randomUUID } from "node:crypto";

export const VERSION = "0.2.0";
export const DEFAULT_TIMEOUT_MS = 30_000;

export class PortalError extends Error {
	constructor(
		message: string,
		readonly status?: number,
	) {
		super(message);
		this.name = "PortalError";
	}
}

export interface Config {
	url: string;
	key: string;
	timeoutMs: number;
}

/** Reads COB_PORTAL_URL, COB_PORTAL_KEY and the optional COB_PORTAL_TIMEOUT_MS. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
	const url = (env.COB_PORTAL_URL ?? "").trim().replace(/\/+$/, "");
	const key = (env.COB_PORTAL_KEY ?? "").trim();
	if (!url)
		throw new PortalError(
			"COB_PORTAL_URL is not set. Set it to the portal address, for example https://portal.example.com.",
		);
	if (!/^https?:\/\//i.test(url)) throw new PortalError("COB_PORTAL_URL must start with http:// or https://.");
	if (!key) {
		throw new PortalError("COB_PORTAL_KEY is not set. Make a key on the portal Profile page, under API keys.");
	}
	if (!key.startsWith("cob_"))
		throw new PortalError("COB_PORTAL_KEY is not a portal key. A portal key starts with cob_.");
	const raw = (env.COB_PORTAL_TIMEOUT_MS ?? "").trim();
	let timeoutMs = DEFAULT_TIMEOUT_MS;
	if (raw) {
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 1000) {
			throw new PortalError("COB_PORTAL_TIMEOUT_MS must be a whole number of milliseconds, 1000 or more.");
		}
		timeoutMs = n;
	}
	return { url, key, timeoutMs };
}

export interface Me {
	person: { name: string; email: string };
	key: { name: string; prefix: string; scopes: string[]; expires_at: string };
}

const HINTS: Record<number, string> = {
	401: "The portal did not accept the key. It may be wrong, ended or revoked. Make a new key on the portal Profile page, under API keys, and put it in COB_PORTAL_KEY.",
	403: "This key may not do this. It lacks a scope, or the person lacks the right. Make a new key with the scope on the portal Profile page.",
	429: "The key made too many calls. Wait a minute, then try again.",
};

function describeDetails(details: unknown): string {
	if (details === null || details === undefined) return "";
	if (Array.isArray(details)) {
		const lines = details.map((d) => {
			if (d && typeof d === "object" && "message" in d) {
				const { path, message } = d as { path?: unknown; message?: unknown };
				return path ? `${String(path)}: ${String(message)}` : String(message);
			}
			return typeof d === "string" ? d : JSON.stringify(d);
		});
		return lines.length ? `\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
	}
	return `\nDetails: ${typeof details === "string" ? details : JSON.stringify(details)}`;
}

/** The text an agent reads when the portal answers with an error. It keeps the code, the message and every details path. */
export function errorFromResponse(status: number, body: unknown): PortalError {
	const err = (body as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error;
	const hint = HINTS[status];
	let text: string;
	if (err && typeof err === "object") {
		const code = typeof err.code === "string" ? err.code : `http_${status}`;
		const message = typeof err.message === "string" ? err.message : `HTTP ${status}`;
		text = `${code}: ${message}${describeDetails(err.details)}`;
	} else {
		text = `The portal answered HTTP ${status}.`;
	}
	return new PortalError(hint ? `${text}\n${hint}` : text, status);
}

type Query = Record<string, string | number | undefined>;

export class PortalClient {
	private readonly fetchImpl: typeof fetch;
	constructor(
		private readonly config: Config,
		fetchImpl?: typeof fetch,
	) {
		this.fetchImpl = fetchImpl ?? fetch;
	}

	private async send(method: "GET" | "POST", path: string, query?: Query, body?: unknown): Promise<unknown> {
		const url = new URL(`${this.config.url}${path}`);
		for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.config.key}`,
			Accept: "application/json",
			"User-Agent": `cob-portal-mcp/${VERSION}`,
		};
		if (method === "POST") {
			headers["Content-Type"] = "application/json";
			// A new key for each tool call, so a retry of one call cannot make a second draft or note.
			headers["Idempotency-Key"] = randomUUID();
		}
		let res: Response;
		try {
			res = await this.fetchImpl(url, {
				method,
				headers,
				body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
				signal: AbortSignal.timeout(this.config.timeoutMs),
			});
		} catch (e) {
			if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
				throw new PortalError(`The portal did not answer in ${this.config.timeoutMs} ms. Try again.`);
			}
			throw new PortalError(`Could not reach the portal at ${this.config.url}. Check COB_PORTAL_URL and the network.`);
		}
		const text = await res.text();
		let parsed: unknown = null;
		if (text) {
			try {
				parsed = JSON.parse(text);
			} catch {
				parsed = null;
			}
		}
		if (!res.ok) throw errorFromResponse(res.status, parsed);
		// A sign-in page or a proxy page instead of the API: say so, never pass null on as data.
		if (res.redirected || parsed === null || typeof parsed !== "object") {
			throw new PortalError(
				`The portal at ${this.config.url} did not answer with API data (it sent a web page). Check COB_PORTAL_URL, and that the portal is up to date.`,
			);
		}
		return parsed;
	}

	get<T = unknown>(path: string, query?: Query): Promise<T> {
		return this.send("GET", path, query) as Promise<T>;
	}

	post<T = unknown>(path: string, body: unknown): Promise<T> {
		return this.send("POST", path, undefined, body) as Promise<T>;
	}

	me(): Promise<Me> {
		return this.get<Me>("/api/v1/me");
	}
}
