const CLEAR_SCREEN = /\x1b\[2J\x1b\[H/g;

export interface RevisionRenderCache<T> {
	revision: number;
	width: number;
	value: T;
}

export function renderByRevision<T>(
	cache: RevisionRenderCache<T> | undefined,
	revision: number,
	width: number,
	render: () => T,
): { cache: RevisionRenderCache<T>; reused: boolean } {
	if (cache?.revision === revision && cache.width === width) return { cache, reused: true };
	return { cache: { revision, width, value: render() }, reused: false };
}

export interface TranscriptRowRange {
	transcriptStart: number;
	height: number;
}

export function transcriptLineForViewport(
	viewportLine: number,
	topPadding: number,
	transcriptStart: number,
): number | undefined {
	return viewportLine < topPadding ? undefined : transcriptStart + viewportLine - topPadding;
}

export function findTranscriptRow<T extends TranscriptRowRange>(rows: readonly T[], transcriptLine: number): T | undefined {
	return rows.find((row) => transcriptLine >= row.transcriptStart && transcriptLine < row.transcriptStart + row.height);
}

export interface DrawerLayoutPlan {
	width: number;
	height: number;
	bordered: boolean;
	showHeader: boolean;
	showDivider: boolean;
	showQueue: boolean;
	showFooter: boolean;
	viewportHeight: number;
}

export function planDrawerLayout(width: number, terminalRows: number, hasQueue: boolean): DrawerLayoutPlan {
	const safeWidth = Math.max(0, Math.trunc(width));
	const height = Math.max(0, Math.min(34, Math.trunc(terminalRows)));
	if (safeWidth < 2 || height < 5) {
		return {
			width: safeWidth,
			height,
			bordered: false,
			showHeader: height > 0,
			showDivider: false,
			showQueue: false,
			showFooter: false,
			viewportHeight: height >= 2 ? 1 : 0,
		};
	}
	const showFooter = height >= 8;
	const showQueue = hasQueue && height >= 9;
	const showDivider = height >= 7;
	const chrome = 2 + 1 + 1 + (showDivider ? 2 : 0) + (showFooter ? 1 : 0) + (showQueue ? 1 : 0);
	return {
		width: safeWidth,
		height,
		bordered: true,
		showHeader: true,
		showDivider,
		showQueue,
		showFooter,
		viewportHeight: Math.max(1, height - chrome),
	};
}
const ANSI_ESCAPE = /\x1b(?:\][^\x07]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~])/g;

function stripAnsi(value: string): string {
	return value.replace(ANSI_ESCAPE, "");
}

export function latestInspectorFrame(output: string): string {
	const frames = output.split(CLEAR_SCREEN);
	return frames.at(-1) ?? "";
}

export function cleanInspectorLines(frame: string): string[] {
	const lines = frame.replace(/\r/g, "").split("\n");
	const cleaned: string[] = [];
	let skipStep = false;
	let waitForTranscript = false;

	for (const line of lines) {
		const plain = stripAnsi(line).trim();
		if (!plain) continue;
		if (plain.startsWith("Step:")) {
			skipStep = true;
			continue;
		}
		if (plain === "Artifacts:") {
			skipStep = false;
			waitForTranscript = true;
			continue;
		}
		if (skipStep) continue;
		if (waitForTranscript) {
			if (!plain.startsWith("Task:") &&
				!/^\w[\w.-]*:\s/.test(plain) &&
				!plain.startsWith("Control error:") &&
				plain !== "Status refreshed.") continue;
			waitForTranscript = false;
		}
		if (plain.startsWith("pi-subagents inspector for ") ||
			plain === "This inspector mirrors lifecycle artifacts; closing it does not stop the run." ||
			plain.startsWith("Mission:") ||
			plain.startsWith("Mission id:") ||
			plain.startsWith("Run:") ||
			plain.startsWith("Mode:") ||
			plain.startsWith("Transcript tail from ") ||
			plain.startsWith("Controls: ") ||
			plain.startsWith("Supervisor replies remain in the parent Pi session") ||
			plain === ">") continue;
		cleaned.push(line.replace(/^\s{2}/, ""));
	}
	return cleaned;
}

function setArg(argv: string[], key: string, value: string): void {
	const position = argv.indexOf(key);
	if (position >= 0 && position + 1 < argv.length) argv[position + 1] = value;
	else argv.push(key, value);
}

export function inspectorArgvForTarget(
	argv: readonly string[],
	target: { runId: string; asyncDir: string; index: number },
): string[] {
	const next = [...argv];
	setArg(next, "--run-id", target.runId);
	setArg(next, "--async-dir", target.asyncDir);
	setArg(next, "--index", String(target.index));
	return next;
}

export function inspectorArgvForIndex(argv: readonly string[], index: number): string[] {
	const next = [...argv];
	setArg(next, "--index", String(index));
	return next;
}

export function appendInspectorOutput(previous: string, chunk: string, maxLength = 500_000): string {
	const next = previous + chunk;
	const lastClear = next.lastIndexOf("\x1b[2J\x1b[H");
	const current = lastClear >= 0 ? next.slice(lastClear) : next;
	return current.length > maxLength ? current.slice(-maxLength) : current;
}
