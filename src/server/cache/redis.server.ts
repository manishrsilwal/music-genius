/**
 * Upstash Redis cache adapter (ARCHITECTURE.md D-024, resolves OD-001).
 *
 * HTTP-based rather than a TCP client, so it runs on every target — Node, Bun,
 * Vercel, Cloudflare Workers — which is what lets D-009 keep the deployment
 * decision open.
 *
 * Every failure degrades to a miss rather than an error. A cache that can take
 * the page down is worse than no cache: lyrics are always re-fetchable from
 * LRCLIB, so the right response to a Redis outage is to be slow, not broken.
 */

import { Redis } from "@upstash/redis";

import type { CacheAdapter } from "../../lib/cache";
import { env } from "../env";

/** Namespaced so a shared Redis instance cannot collide with another app. */
const PREFIX = "tle:";

export function createRedisCache(): CacheAdapter {
	const redis = new Redis({
		url: env.upstashUrl as string,
		token: env.upstashToken as string,
	});

	return {
		async get<T>(key: string): Promise<T | null> {
			try {
				// Upstash deserialises JSON for us, so this is already an object.
				const value = await redis.get<T>(PREFIX + key);
				return value ?? null;
			} catch (error) {
				console.warn("[cache] redis get failed; treating as a miss", error);
				return null;
			}
		},

		async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
			try {
				await redis.set(PREFIX + key, value, { ex: ttlSeconds });
			} catch (error) {
				// A failed write is invisible to the reader — the value was
				// already computed and returned.
				console.warn("[cache] redis set failed", error);
			}
		},
	};
}
