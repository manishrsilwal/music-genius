import { useState } from "react";

import { useInsights } from "../hooks/use-insights";
import { DiscoverButton, InsightsDrawer } from "./insights-drawer";

/**
 * Owns the drawer's open state and reports it upward, so the track shell can
 * compress the canvas on desktop rather than covering it (PRD §3.5).
 */
export function InsightsAffordance({
	trackId,
	onOpenChange,
}: {
	trackId: string;
	onOpenChange: (open: boolean) => void;
}) {
	const { state, insight } = useInsights(trackId);
	const [open, setOpen] = useState(false);

	const setBoth = (next: boolean) => {
		setOpen(next);
		onOpenChange(next);
	};

	return (
		<>
			<DiscoverButton
				state={state}
				open={open}
				onToggle={() => setBoth(!open)}
			/>
			{insight && (
				<InsightsDrawer
					insight={insight}
					open={open}
					onClose={() => setBoth(false)}
				/>
			)}
		</>
	);
}
