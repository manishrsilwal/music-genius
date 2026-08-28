/**
 * The chosen-state mark (D-122, the owner's report): a lime hairline alone
 * did not read as "selected" at a glance, so every toggle that sits chosen
 * says so twice — the edge for the glance, this check for certainty. Drawn,
 * not an emoji; decorative, because the control's aria-pressed already
 * speaks the state.
 */
export function Tick({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 12 12"
			width="12"
			height="12"
			aria-hidden="true"
			focusable="false"
		>
			<path
				d="M2 6.5 L4.8 9.3 L10 3.2"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
