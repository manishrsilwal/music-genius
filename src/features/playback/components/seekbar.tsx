import type { ChangeEvent } from "react";

/**
 * The scrub track (D-040).
 *
 * A real `<input type="range">` rather than a styled div with pointer
 * handlers: it arrives with keyboard control, screen-reader semantics and
 * drag behaviour already correct, and the platform's own accessibility
 * affordances are better than any we would rebuild.
 */
export function Seekbar({
	currentTime,
	duration,
	disabled,
	onSeek,
}: {
	currentTime: number;
	duration: number;
	disabled: boolean;
	onSeek: (seconds: number) => void;
}) {
	// Guard the divide: duration is 0 until the player reports it, and NaN
	// would silently blank the fill.
	const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

	return (
		<input
			type="range"
			className="playback__seek"
			min={0}
			max={duration || 0}
			step={0.1}
			value={Math.min(currentTime, duration || 0)}
			disabled={disabled || duration <= 0}
			aria-label="Seek"
			aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
			style={{ "--progress": `${progress}%` } as React.CSSProperties}
			onChange={(event: ChangeEvent<HTMLInputElement>) =>
				onSeek(Number(event.target.value))
			}
		/>
	);
}

/** `m:ss`, or `h:mm:ss` past an hour. Never `NaN:aN`. */
export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const whole = Math.floor(seconds);
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor((whole % 3600) / 60);
	const secs = whole % 60;
	const pad = (value: number) => String(value).padStart(2, "0");
	return hours > 0
		? `${hours}:${pad(minutes)}:${pad(secs)}`
		: `${minutes}:${pad(secs)}`;
}
