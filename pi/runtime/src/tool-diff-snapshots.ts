export type ToolDiffSnapshotState = "pending" | "ready" | "failed" | "unavailable";

export interface ToolDiffSnapshot {
	toolCallId: string;
	scope?: string;
	path: string;
	before: string | null;
	after?: string | null;
	patch?: string;
	state: ToolDiffSnapshotState;
}

export type ToolDiffSnapshotLookup =
	| { status: "missing" }
	| { status: "pending"; snapshot: ToolDiffSnapshot }
	| { status: "failed"; snapshot: ToolDiffSnapshot }
	| { status: "unavailable"; snapshot: ToolDiffSnapshot }
	| { status: "unchanged"; snapshot: ToolDiffSnapshot }
	| { status: "ready"; snapshot: ToolDiffSnapshot };

export type ToolDiffSnapshotStore = Map<string, ToolDiffSnapshot>;

function snapshotKey(toolCallId: string, scope?: string): string {
	return `${scope ?? "main"}\0${toolCallId}`;
}

export function createToolDiffSnapshotStore(): ToolDiffSnapshotStore {
	return new Map();
}

export function startToolDiffSnapshot(
	store: ToolDiffSnapshotStore,
	input: { toolCallId: string; scope?: string; path: string; before: string | null },
): void {
	store.set(snapshotKey(input.toolCallId, input.scope), { ...input, state: "pending" });
}

export function toolResultPatch(result: unknown): string | undefined {
	if (!result || typeof result !== "object") return undefined;
	const details = (result as { details?: unknown }).details;
	if (!details || typeof details !== "object") return undefined;
	const patch = (details as { patch?: unknown }).patch;
	return typeof patch === "string" ? patch : undefined;
}

export function finishToolDiffSnapshot(
	store: ToolDiffSnapshotStore,
	input: {
		toolCallId: string;
		scope?: string;
		after?: string | null;
		patch?: string;
		failed?: boolean;
		unavailable?: boolean;
	},
): void {
	const snapshot = store.get(snapshotKey(input.toolCallId, input.scope));
	if (!snapshot) return;
	if (input.failed) {
		snapshot.state = "failed";
		delete snapshot.after;
		delete snapshot.patch;
		return;
	}
	if (input.unavailable) {
		snapshot.state = "unavailable";
		delete snapshot.after;
		delete snapshot.patch;
		return;
	}
	snapshot.state = "ready";
	snapshot.after = input.after ?? null;
	if (input.patch !== undefined) snapshot.patch = input.patch;
}

export function lookupToolDiffSnapshot(
	store: ToolDiffSnapshotStore,
	toolCallId: string,
	scope?: string,
): ToolDiffSnapshotLookup {
	const snapshot = store.get(snapshotKey(toolCallId, scope));
	if (!snapshot) return { status: "missing" };
	if (snapshot.state === "pending") return { status: "pending", snapshot };
	if (snapshot.state === "failed") return { status: "failed", snapshot };
	if (snapshot.state === "unavailable") return { status: "unavailable", snapshot };
	if (snapshot.patch !== undefined) {
		return snapshot.patch.trim()
			? { status: "ready", snapshot }
			: { status: "unchanged", snapshot };
	}
	return snapshot.before === snapshot.after
		? { status: "unchanged", snapshot }
		: { status: "ready", snapshot };
}
