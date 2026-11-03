export function compactTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens < 0) return "?";
	if (tokens < 1_000) return String(Math.round(tokens));
	if (tokens < 1_000_000) {
		const value = tokens / 1_000;
		return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")}k`;
	}
	const value = tokens / 1_000_000;
	return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")}m`;
}

export function formatFooterContext(
	usage: { percent: number | null; contextWindow: number } | undefined,
): string | undefined {
	if (!usage || !Number.isFinite(usage.contextWindow) || usage.contextWindow <= 0) return undefined;
	const percent = usage.percent === null || !Number.isFinite(usage.percent)
		? "?"
		: `${Math.round(usage.percent)}%`;
	return `${percent}/${compactTokenCount(usage.contextWindow)}`;
}
