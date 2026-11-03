export type ToolPathClickTarget = "path" | "diff" | "reveal" | "outside";
export type ToolPathClickAction = "diff" | "reveal" | "terminal" | "none";

export interface ToolPathClickLayout {
	pathStart: number;
	pathEnd: number;
	diffStart: number;
	diffEnd: number;
	revealStart: number;
	revealEnd: number;
}

export interface ToolPathHeaderPlan extends ToolPathClickLayout {
	titleWidth: number;
	pathWidth: number;
	diffWidth: number;
	revealWidth: number;
}

export function clampToolPathWidth(width: number, terminalWidth?: number): number {
	const safeWidth = Math.max(0, Math.trunc(width));
	if (terminalWidth === undefined || terminalWidth <= 0) return safeWidth;
	return Math.min(safeWidth, Math.max(0, Math.trunc(terminalWidth)));
}

export function planToolPathHeader(
	width: number,
	titleWidth: number,
	pathWidth: number,
	diffWidth = "[diff]".length,
	revealWidth = "[reveal]".length,
): ToolPathHeaderPlan {
	const safeWidth = Math.max(0, Math.trunc(width));
	const safeTitle = Math.max(0, Math.trunc(titleWidth));
	const safePath = Math.max(0, Math.trunc(pathWidth));
	const safeDiff = Math.max(0, Math.trunc(diffWidth));
	const safeReveal = Math.max(0, Math.trunc(revealWidth));
	const buttonGap = safeWidth > safeReveal ? 1 : 0;
	const renderedRevealWidth = Math.min(safeReveal, safeWidth);
	const remainingBeforeReveal = Math.max(0, safeWidth - renderedRevealWidth - buttonGap);
	const renderedDiffWidth = Math.min(safeDiff, remainingBeforeReveal);
	const actionWidth = renderedDiffWidth + buttonGap + renderedRevealWidth;
	const pathGap = safeWidth > actionWidth ? 2 : 0;
	const contentWidth = Math.max(0, safeWidth - actionWidth - pathGap);
	const minimumPathWidth = contentWidth > 0 ? 1 : 0;
	const renderedTitleWidth = Math.min(safeTitle, Math.max(0, contentWidth - minimumPathWidth));
	const renderedPathWidth = Math.min(safePath, Math.max(0, contentWidth - renderedTitleWidth));
	const pathStart = renderedTitleWidth;
	const pathEnd = pathStart + renderedPathWidth;
	const diffStart = pathEnd + pathGap;
	const diffEnd = diffStart + renderedDiffWidth;
	const revealStart = diffEnd + buttonGap;
	return {
		titleWidth: renderedTitleWidth,
		pathWidth: renderedPathWidth,
		diffWidth: renderedDiffWidth,
		revealWidth: renderedRevealWidth,
		pathStart,
		pathEnd,
		diffStart,
		diffEnd,
		revealStart,
		revealEnd: revealStart + renderedRevealWidth,
	};
}

export function toolPathClickTarget(x: number, layout: ToolPathClickLayout): ToolPathClickTarget {
	if (x >= layout.pathStart && x < layout.pathEnd) return "path";
	if (x >= layout.diffStart && x < layout.diffEnd) return "diff";
	if (x >= layout.revealStart && x < layout.revealEnd) return "reveal";
	return "outside";
}

export function toolPathClickAction(input: {
	toolName: string;
	target: ToolPathClickTarget;
	ctrl: boolean;
	shift: boolean;
}): ToolPathClickAction {
	if (input.target === "diff" && input.toolName === "edit") return "diff";
	if (input.target === "reveal") return "reveal";
	return input.target === "path" && input.toolName !== "edit" ? "terminal" : "none";
}
