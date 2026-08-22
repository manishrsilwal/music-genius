import { describe, expect, it } from "vitest";

import { domainOf } from "./insights-content";

/**
 * Source URLs come from Tavily, so they are third-party data: a malformed one
 * must degrade to an empty label rather than throwing inside render and
 * taking the whole drawer down with it (D-043).
 */
describe("domainOf", () => {
	it("strips the scheme, the www and the path", () => {
		expect(
			domainOf("https://www.theguardian.com/culture/2016/mar/07/how-we-made"),
		).toBe("theguardian.com");
		expect(domainOf("https://en.wikipedia.org/wiki/Creep")).toBe(
			"en.wikipedia.org",
		);
	});

	it("keeps a subdomain that is not www", () => {
		expect(domainOf("https://talldarkandhojung.medium.com/nights")).toBe(
			"talldarkandhojung.medium.com",
		);
	});

	it("handles a bare origin and a port", () => {
		expect(domainOf("https://songfacts.com")).toBe("songfacts.com");
		expect(domainOf("http://example.com:8080/x")).toBe("example.com");
	});

	it("returns empty rather than throwing on junk", () => {
		expect(domainOf("not a url")).toBe("");
		expect(domainOf("")).toBe("");
	});
});
