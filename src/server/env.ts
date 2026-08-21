/**
 * Server-only environment access.
 *
 * Never import this from a component or a loader — loaders are isomorphic and
 * would leak values into the client bundle. Only *.server.ts and server
 * functions may read it. See ARCHITECTURE.md D-014.
 *
 * Every integration is optional by design: the app must run with no secrets at
 * all, degrading to the features it can actually serve. That keeps the repo
 * cloneable and reviewable without handing anyone a set of keys.
 */

function read(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

export const env = {
	/** Genius API client access token — album art and metadata (OD-005). */
	geniusAccessToken: read("GENIUS_ACCESS_TOKEN"),

	/** Gemini — synthesis for the insights drawer (OD-003). */
	geminiApiKey: read("GEMINI_API_KEY"),
	/**
	 * Model names churn fast, so this is configurable rather than pinned in
	 * code. Override when a newer or cheaper model is available.
	 */
	geminiModel: read("GEMINI_MODEL") ?? "gemini-3.5-flash",

	/**
	 * Upstash Redis — the production cache (OD-001).
	 *
	 * HTTP-based rather than a TCP client, so it works on every runtime,
	 * including Workers. That keeps the deployment target deferred (D-009).
	 */
	upstashUrl: read("UPSTASH_REDIS_REST_URL"),
	upstashToken: read("UPSTASH_REDIS_REST_TOKEN"),

	/** Tavily — web grounding for the sources gallery (OD-004). */
	tavilyApiKey: read("TAVILY_API_KEY"),
} as const;

/** What this deployment can actually do, given the secrets present. */
export const features = {
	get artwork(): boolean {
		return Boolean(env.geniusAccessToken);
	},

	/** A durable cache. Without it we fall back to a per-process map. */
	get persistentCache(): boolean {
		return Boolean(env.upstashUrl && env.upstashToken);
	},

	/** The drawer needs an LLM at minimum. */
	get insights(): boolean {
		return Boolean(env.geminiApiKey);
	},

	/**
	 * Web grounding. Without it the synthesis is written from the lyrics alone,
	 * which is honest but thinner — and means no quote at all.
	 */
	get grounding(): boolean {
		return Boolean(env.tavilyApiKey);
	},
} as const;
