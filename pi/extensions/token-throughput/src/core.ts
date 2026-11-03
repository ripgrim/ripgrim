export function tokensPerSecond(outputTokens: number, elapsedMs: number): number | undefined {
	if (!Number.isFinite(outputTokens) || outputTokens <= 0) return undefined;
	if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return undefined;
	return outputTokens / (elapsedMs / 1000);
}

export function estimatedTokensFromCharacters(characters: number): number {
	if (!Number.isFinite(characters) || characters <= 0) return 0;
	return characters / 4;
}

export function formatTokensPerSecond(value: number, estimated = false): string {
	if (!Number.isFinite(value) || value < 0) return "— tok/s";
	const precision = value < 10 ? 1 : 0;
	return `${estimated ? "~" : ""}${value.toFixed(precision)} tok/s`;
}
