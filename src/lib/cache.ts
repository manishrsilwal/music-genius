/**
 * Cache abstraction. See ARCHITECTURE.md D-009 and OD-001.
 *
 * The deployment target is deliberately undecided, and the cache backend forks
 * on it (Vercel KV / Cloudflare KV / Upstash Redis). Everything therefore talks
 * to this interface, so swapping backends is a one-file change.
 *
 * The in-memory adapter is for development only: it is per-process, so it does
 * not survive a restart and is useless across serverless instances. It must be
 * replaced before the <500ms production target in PRD §5 means anything.
 */

export interface CacheAdapter {
	get<T>(key: string): Promise<T | null>;
	set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

/** TTLs in seconds, named so call sites read as intent. */
export const TTL = {
	/** PRD §4: "cached for 30 days". Lyrics effectively never change. */
	track: 60 * 60 * 24 * 30,
	/** Searches churn far more than tracks; keep them fresh-ish. */
	search: 60 * 60,
} as const;

interface Entry {
	value: unknown;
	expiresAt: number;
}

/**
 * Development adapter. Bounded so a long-running dev server cannot grow without
 * limit; eviction is oldest-inserted-first, which is adequate because this is
 * never the production path.
 */
export function createMemoryCache(maxEntries = 500): CacheAdapter {
	const store = new Map<string, Entry>();

	return {
		async get<T>(key: string): Promise<T | null> {
			const hit = store.get(key);
			if (!hit) return null;
			if (hit.expiresAt < Date.now()) {
				store.delete(key);
				return null;
			}
			return hit.value as T;
		},

		async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
			if (store.size >= maxEntries) {
				const oldest = store.keys().next();
				if (!oldest.done) store.delete(oldest.value);
			}
			store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
		},
	};
}

let adapter: CacheAdapter | null = null;

/**
 * Process-wide cache.
 *
 * Resolved once, lazily, so the adapter is chosen after the environment is
 * loaded. The in-memory implementation is the fallback, not the default: it is
 * per-process, so it neither survives a restart nor is shared between
 * serverless instances, which makes PRD §5's sub-500ms target unreachable with
 * it in place.
 *
 * The import is dynamic so the Redis client never enters a bundle that has no
 * credentials to use it with.
 */
export function setCacheAdapter(next: CacheAdapter): void {
	adapter = next;
}

export function getCache(): CacheAdapter {
	if (!adapter) adapter = createMemoryCache();
	return adapter;
}

/** Read-through helper: fetch on miss, populate, return. */
export async function cached<T>(
	key: string,
	ttlSeconds: number,
	produce: () => Promise<T>,
): Promise<T> {
	const cache = getCache();
	const hit = await cache.get<T>(key);
	if (hit !== null) return hit;

	const value = await produce();
	await cache.set(key, value, ttlSeconds);
	return value;
}
