import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Spotify client mints its own app token and adjudicates matches with the
 * shared scoring (D-111). These tests pin the three behaviours that decide
 * what a reader sees: the confidence bar, the image-size choices, and the
 * token's lifetime — a token re-minted per lookup would hammer the accounts
 * endpoint, and one held past expiry would fail every search for an hour.
 */

vi.mock("./env", () => ({
	env: {
		spotifyClientId: "id",
		spotifyClientSecret: "secret",
	},
	features: { spotify: true },
}));

import { findSpotifyArtwork, resetSpotifyToken } from "./spotify.server";

function tokenResponse() {
	return Response.json({ access_token: "app-token", expires_in: 3600 });
}

function searchResponse(items: unknown[]) {
	return Response.json({ tracks: { items } });
}

function spotifyTrack(name: string, artists: string[], sizes = [640, 300, 64]) {
	return {
		name,
		artists: artists.map((artist) => ({ name: artist })),
		album: {
			images: sizes.map((size) => ({
				url: `https://img.example/${size}`,
				width: size,
				height: size,
			})),
		},
	};
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	resetSpotifyToken();
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("findSpotifyArtwork", () => {
	it("returns the largest image as full and the middle as thumbnail", async () => {
		fetchMock
			.mockResolvedValueOnce(tokenResponse())
			.mockResolvedValueOnce(
				searchResponse([spotifyTrack("Creep", ["Radiohead"])]),
			);

		const artwork = await findSpotifyArtwork("Creep", "Radiohead");

		expect(artwork).not.toBeNull();
		expect(artwork?.source).toBe("spotify");
		expect(artwork?.full).toBe("https://img.example/640");
		expect(artwork?.thumbnail).toBe("https://img.example/300");
		// No Genius id: playback must never be attempted off this match.
		expect(artwork?.geniusId).toBeUndefined();
	});

	it("scores against the best of several credited artists", async () => {
		fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
			searchResponse([
				// Spotify bills every artist; LRCLIB led with the composer.
				spotifyTrack("Tum Se Hi", ["Mohit Chauhan", "Pritam"]),
			]),
		);

		const artwork = await findSpotifyArtwork("Tum Se Hi", "Mohit Chauhan");
		expect(artwork).not.toBeNull();
	});

	it("refuses a match below the confidence threshold", async () => {
		fetchMock
			.mockResolvedValueOnce(tokenResponse())
			.mockResolvedValueOnce(
				searchResponse([spotifyTrack("Completely Different Song", ["Nobody"])]),
			)
			// The retry ladder may search again; keep answering emptily.
			.mockResolvedValue(searchResponse([]));

		const artwork = await findSpotifyArtwork("Creep", "Radiohead");
		expect(artwork).toBeNull();
	});

	it("reuses the app token across lookups", async () => {
		fetchMock
			.mockResolvedValueOnce(tokenResponse())
			.mockResolvedValueOnce(
				searchResponse([spotifyTrack("Creep", ["Radiohead"])]),
			)
			.mockResolvedValueOnce(
				searchResponse([spotifyTrack("Karma Police", ["Radiohead"])]),
			);

		await findSpotifyArtwork("Creep", "Radiohead");
		await findSpotifyArtwork("Karma Police", "Radiohead");

		const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
			String(url).includes("accounts.spotify.com"),
		);
		expect(tokenCalls).toHaveLength(1);
	});

	it("degrades to null when the token request fails", async () => {
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 400 }));

		const artwork = await findSpotifyArtwork("Creep", "Radiohead");
		expect(artwork).toBeNull();
	});

	it("returns null rather than throwing on a network failure", async () => {
		fetchMock.mockRejectedValue(new Error("offline"));

		const artwork = await findSpotifyArtwork("Creep", "Radiohead");
		expect(artwork).toBeNull();
	});
});
