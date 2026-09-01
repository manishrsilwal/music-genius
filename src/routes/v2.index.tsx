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

	/*
	 * The deal (D-130). The pick itself is instantaneous — local ranking,
	 * no network — so a press used to swap cards mid-glance, which read as
	 * nothing happening. The pause IS the feedback: cards dim, the arrows
	 * spin, the new hand staggers in. Readers who ask for reduced motion
	 * get the honest version — an instant swap, no artificial wait.
	 */
	const [dealing, setDealing] = useState(false);
	const reshuffle = () => {
		if (dealing) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			shuffle();
			return;
		}
		setDealing(true);
		window.setTimeout(() => {
			shuffle();
			setDealing(false);
		}, 450);
	};

	const dives = useMemo(
		() => pickDeepDives(preferences, seed, undefined, seen, taste, rotation),
		[preferences, seed, seen, taste, rotation],
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
				<div className="v2disco__result">
					{/* The reader's answers as STAMPS — mood rose, pull blue,
					    familiarity honey, languages white, Retake black — each a
					    mini card of its own, not v1's quiet pills. Retake reopens
					    the chat; the hidden-songs door back rides beside them. */}
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

					{/* Full-bleed colour bands (owner's pick): each shelf is an
					    edge-to-edge block in its own fill — white, honey, blue —
					    Anton headline plus one sticker tag, the pink ground
					    showing between them. The band IS how a v2 section
					    announces itself; the white panels were v1's grammar. */}
					<section className="v2band v2band--white">
						<div className="v2band__inner">
							<header className="v2band__head">
								<h2 className="v2band__title">Deep dives</h2>
								<span className="v2band__sticker" aria-hidden="true">
									By hand
								</span>
								{/* The shelf's action lives in the shelf's HEAD, top
								    right — where Clear sits one band down (owner's
								    third round). No onShuffle to DeepDives, so v1's
								    ghost slot never renders in v2 and the grid keeps
								    its three full columns. */}
								{dives.length > 0 && (
									<button
										type="button"
										className="v2band__action"
										onClick={reshuffle}
										aria-busy={dealing || undefined}
									>
										<svg
											viewBox="0 0 14 14"
											width="13"
											height="13"
											aria-hidden="true"
											focusable="false"
										>
											<path
												d="M1.5 5.5 A5 5 0 0 1 11 3.5 M12.5 8.5 A5 5 0 0 1 3 10.5"
												fill="none"
												stroke="currentColor"
												strokeWidth="1.5"
												strokeLinecap="round"
											/>
											<path
												d="M11.5 0.8 L11.3 4 L8.2 3.4 Z"
												fill="currentColor"
											/>
											<path
												d="M2.5 13.2 L2.7 10 L5.8 10.6 Z"
												fill="currentColor"
											/>
										</svg>
										Show me different picks
									</button>
								)}
							</header>
							<p className="v2band__lead">
								Three from our catalogue. They change every time you come back.
							</p>
							<div className="v2band__deal" data-busy={dealing || undefined}>
								{dives.length > 0 ? (
									<DeepDives
										picks={dives}
										preferences={preferences}
										verdicts={{ isLiked, onLike: toggleLike, onHide: hide }}
										trackTo="/v2/track/$trackId"
									/>
								) : (
									<p className="v2band__lead">
										Nothing on our shelf is true to your answers yet — we would
										rather leave it short than fill it with songs you did not
										ask for. Search reaches every song, in every language.
									</p>
								)}
							</div>
						</div>
					</section>

					{also.length > 0 && (
						<section className="v2band v2band--honey">
							<div className="v2band__inner">
								<header className="v2band__head">
									<h2 className="v2band__title">People also like</h2>
									<span className="v2band__sticker" aria-hidden="true">
										Fresh daily
									</span>
								</header>
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
							</div>
						</section>
					)}

					{/* A div, not a section — ContinueReading brings its own
					    <section> and heading; the band restyles them in place. */}
					{entries.length > 0 && (
						<div className="v2band v2band--blue">
							<div className="v2band__inner">
								<ContinueReading
									entries={entries}
									onRemove={remove}
									onClear={clear}
									trackTo="/v2/track/$trackId"
								/>
							</div>
						</div>
					)}
				</div>
			)}
		</main>
	);
}
