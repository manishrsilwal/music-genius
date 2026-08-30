import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { ContinueReading } from "@/features/discovery/components/continue-reading";
import {
	AlsoLiked,
	DeepDives,
} from "@/features/discovery/components/deep-dives";
import { PreferenceChat } from "@/features/discovery/components/preference-chat";
import { SearchField } from "@/features/discovery/components/search-field";
import { TasteChips } from "@/features/discovery/components/taste-chips";
import { useHistory } from "@/features/discovery/hooks/use-history";
import { usePreferences } from "@/features/discovery/hooks/use-preferences";
import { useRotation } from "@/features/discovery/hooks/use-rotation";
import { useTaste } from "@/features/discovery/hooks/use-taste";
import {
	MOOD_TITLE_NOUN,
	pickAlsoLiked,
	pickDeepDives,
	seedFromDate,
} from "@/lib/deep-dives";

/**
 * v2 Discover (D-126) — v1's WHOLE flow, in v2's clothes. The owner's
 * ruling: "implement the same flow, not UI". So this is v1's Discovery
 * verbatim in structure and logic — the feelings chat for a first visit,
 * the mood-promise Deep Dives with their shared-reason line, People also
 * like with its load-more, taste chips with retake, the More-like-this /
 * Not-for-me verdicts with the hidden-songs door back, continue reading,
 * search with autocomplete, the rotation shuffle — reusing v1's own
 * components and hooks (same localStorage identity: answer here,
 * personalised there), re-costumed by the .v2 scope's token re-point.
 */

export const Route = createFileRoute("/v2/")({
	loader: () => ({ today: new Date().toISOString().slice(0, 10) }),
	component: DiscoverV2,
});

function DiscoverV2() {
	const { today } = Route.useLoaderData();
	const { preferences, answered, save, reset } = usePreferences();
	const { entries, remove, clear } = useHistory();
	const { rotation, shuffle } = useRotation();
	const { taste, hiddenCount, isLiked, hide, toggleLike, restoreHidden } =
		useTaste();

	const unpersonalised =
		answered === true &&
		!preferences.mood &&
		!preferences.pull &&
		!preferences.familiarity &&
		!preferences.languages;

	const seed = seedFromDate(today) + rotation * 7919;
	const seen = useMemo(() => entries.map((entry) => entry.id), [entries]);
	const [alsoCount, setAlsoCount] = useState(12);

	const dives = useMemo(
		() => pickDeepDives(preferences, seed, undefined, seen, taste),
		[preferences, seed, seen, taste],
	);
	const also = useMemo(
		() => pickAlsoLiked(preferences, seed, dives, alsoCount, seen, taste),
		[preferences, seed, dives, alsoCount, seen, taste],
	);
	const alsoExhausted = also.length < alsoCount;

	return (
		<main>
			<h1 className="disco__hero">
				{answered === true && !unpersonalised && preferences.mood ? (
					<>
						Songs for your <em>{MOOD_TITLE_NOUN[preferences.mood]}</em>
					</>
				) : unpersonalised ? (
					<>
						Search <em>anything</em>
					</>
				) : (
					<>
						What's the <em>vibe?</em>
					</>
				)}
			</h1>

			{answered === null ? (
				<div className="h-64" />
			) : answered === false ? (
				<div className="v2disco__welcome">
					{/* v1's feelings chat, verbatim — same questions, same AI
					    free-text door, same stored answers both cuts read. */}
					<PreferenceChat onComplete={save} />
					<aside className="v2disco__teaser">
						{/* The escape IS the thing itself here (owner's call): a
						    live search instead of a "skip to search" button. The
						    chat's own skip survives below lg, where this rail
						    does not render — D-064 keeps its phone escape. */}
						<div className="v2disco__teaser-search">
							<h2 className="v2disco__teaser-title">Know it already?</h2>
							<SearchField hideLabel trackTo="/v2/track/$trackId" />
						</div>
						<h2 className="v2disco__teaser-title">While you decide</h2>
						<AlsoLiked
							picks={also.slice(0, 5)}
							art
							rail
							trackTo="/v2/track/$trackId"
						/>
					</aside>
				</div>
			) : unpersonalised ? (
				<div className="v2disco__explore">
					<section className="v2panel">
						<SearchField hideLabel autoFocus trackTo="/v2/track/$trackId" />
						<button type="button" onClick={reset} className="v2disco__offer">
							Rather have picks chosen for you? Tell us how you're feeling
						</button>
					</section>
					{entries.length > 0 && (
						<section className="v2panel">
							<ContinueReading
								entries={entries}
								onRemove={remove}
								onClear={clear}
								trackTo="/v2/track/$trackId"
							/>
						</section>
					)}
				</div>
			) : (
				<div className="v2disco__bento">
					{/* The reader's answers, editable in place; Retake reopens
					    the chat. The hidden-songs door back rides beside it. */}
					<section className="v2disco__filter">
						<TasteChips
							preferences={preferences}
							onChange={save}
							onStartOver={reset}
						/>
						{hiddenCount > 0 && (
							<p className="v2disco__hidden">
								{hiddenCount === 1
									? "1 song hidden from your shelves."
									: `${hiddenCount} songs hidden from your shelves.`}{" "}
								<button
									type="button"
									className="v2disco__hidden-restore"
									onClick={restoreHidden}
								>
									Bring them back
								</button>
							</p>
						)}
					</section>

					<div className="v2disco__search">
						<SearchField trackTo="/v2/track/$trackId" />
					</div>

					<section className="v2panel">
						<h2 className="v2disco__shelf-title">Deep dives</h2>
						<p className="v2disco__shelf-lead">
							Three from a catalogue we chose by hand. They change every time
							you come back.
						</p>
						{dives.length > 0 ? (
							<DeepDives
								picks={dives}
								preferences={preferences}
								onShuffle={shuffle}
								verdicts={{ isLiked, onLike: toggleLike, onHide: hide }}
								trackTo="/v2/track/$trackId"
							/>
						) : (
							<p className="v2disco__shelf-lead">
								Nothing on our shelf is true to your answers yet — we would
								rather leave it short than fill it with songs you did not ask
								for. Search reaches every song, in every language.
							</p>
						)}
					</section>

					{also.length > 0 && (
						<section className="v2panel">
							<h2 className="v2disco__shelf-title">People also like</h2>
							<AlsoLiked
								picks={also}
								art
								onHide={hide}
								trackTo="/v2/track/$trackId"
							/>
							{!alsoExhausted && (
								<button
									type="button"
									className="v2disco__more"
									onClick={() => setAlsoCount(alsoCount + 12)}
								>
									Load more
								</button>
							)}
						</section>
					)}

					{entries.length > 0 && (
						<section className="v2panel">
							<ContinueReading
								entries={entries}
								onRemove={remove}
								onClear={clear}
								trackTo="/v2/track/$trackId"
							/>
						</section>
					)}
				</div>
			)}
		</main>
	);
}
