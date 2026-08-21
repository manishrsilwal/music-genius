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
} as const;

/** What this deployment can actually do, given the secrets present. */
export const features = {
	get artwork(): boolean {
		return Boolean(env.geniusAccessToken);
	},
} as const;
