export const PIERRE_DIFF_REQUEST_EVENT = "grim:pierre-diff-request:v1";

export interface ToolDiffSource {
	baseline: "tool";
	path: string;
	toolCallId: string;
	scope?: string;
	before?: string | null;
	after?: string | null;
	patch?: string;
}

export interface PierreDiffRequest {
	version: 1;
	source: ToolDiffSource;
	handled?: boolean;
}

export interface PierreDiffEventBus {
	emit(event: string, request: PierreDiffRequest): unknown;
}

export function emitPierreDiffRequest(events: PierreDiffEventBus, source: ToolDiffSource): PierreDiffRequest {
	const request: PierreDiffRequest = { version: 1, source };
	events.emit(PIERRE_DIFF_REQUEST_EVENT, request);
	return request;
}
