import { useEffect, useState } from "react";

/** Holds a value steady until it stops changing for `delay` ms. */
export function useDebounced<T>(value: T, delay = 220): T {
	const [settled, setSettled] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setSettled(value), delay);
		return () => clearTimeout(timer);
	}, [value, delay]);

	return settled;
}
