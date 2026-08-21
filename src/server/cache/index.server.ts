/**
 * Chooses the cache backend (OD-001).
 *
 * Kept out of src/lib/cache.ts so that module stays isomorphic and free of any
 * server-only import.
 */

import { setCacheAdapter } from "../../lib/cache";
import { features } from "../env";
import { createRedisCache } from "./redis.server";

let initialised = false;

export function initCache(): void {
	if (initialised) return;
	initialised = true;

	if (!features.persistentCache) {
		console.warn(
			"[cache] no UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — using the " +
				"in-memory adapter. Per-process, does not survive a restart, not shared " +
				"across serverless instances. Not suitable for production.",
		);
		return;
	}

	setCacheAdapter(createRedisCache());
}
