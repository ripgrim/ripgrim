import type { Theme } from "@earendil-works/pi-coding-agent";
import {
	getCapabilities,
	hyperlink,
	MouseRegion,
	Text,
	truncateToWidth,
	visibleWidth,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import {
	clampToolPathWidth,
	planToolPathHeader,
	toolPathClickAction,
	toolPathClickTarget,
	type ToolPathClickLayout,
} from "./tool-path-click.ts";

export interface ToolPathHeaderOptions {
	toolName: string;
	rawPath: string;
	theme: Theme;
	fileUrl?: string;
	revealUrl?: string;
	onOpen(path: string, reveal: boolean): void;
	onDiff?: () => void;
}

class EditToolPathHeader implements Component {
	private layout: ToolPathClickLayout = {
		pathStart: 0,
		pathEnd: 0,
		diffStart: 0,
		diffEnd: 0,
		revealStart: 0,
		revealEnd: 0,
	};
	private readonly options: ToolPathHeaderOptions;

	constructor(options: ToolPathHeaderOptions) {
		this.options = options;
	}

	render(width: number): string[] {
		const { toolName, rawPath, theme } = this.options;
		const title = `${toolName} `;
		const diff = "[diff]";
		const reveal = "[reveal]";
		// Tool renderers can receive a stale width after a terminal resize. Clamp
		// to the live terminal so both action targets stay visible and distinct.
		const renderWidth = clampToolPathWidth(width, process.stdout.columns);
		const plan = planToolPathHeader(
			renderWidth,
			visibleWidth(title),
			visibleWidth(rawPath),
			visibleWidth(diff),
			visibleWidth(reveal),
		);
		const titleText = truncateToWidth(title, plan.titleWidth, "");
		const pathText = truncateToWidth(rawPath, plan.pathWidth, "…");
		const diffText = truncateToWidth(diff, plan.diffWidth, "");
		const revealText = truncateToWidth(reveal, plan.revealWidth, "");
		const pathGapWidth = Math.max(0, plan.diffStart - plan.pathEnd);
		const buttonGapWidth = Math.max(0, plan.revealStart - plan.diffEnd);
		const plainPath = theme.fg("muted", pathText);
		const styledDiff = theme.fg("accent", theme.bold(diffText));
		const styledReveal = theme.fg("muted", revealText);
		const revealLink = getCapabilities().hyperlinks && this.options.revealUrl
			? hyperlink(styledReveal, this.options.revealUrl)
			: styledReveal;
		const renderedTitleWidth = visibleWidth(titleText);
		const renderedPathWidth = visibleWidth(pathText);
		const renderedDiffWidth = visibleWidth(diffText);
		const renderedRevealWidth = visibleWidth(revealText);
		this.layout = {
			pathStart: renderedTitleWidth,
			pathEnd: renderedTitleWidth + renderedPathWidth,
			diffStart: renderedTitleWidth + renderedPathWidth + pathGapWidth,
			diffEnd: renderedTitleWidth + renderedPathWidth + pathGapWidth + renderedDiffWidth,
			revealStart: renderedTitleWidth + renderedPathWidth + pathGapWidth + renderedDiffWidth + buttonGapWidth,
			revealEnd: renderedTitleWidth + renderedPathWidth + pathGapWidth + renderedDiffWidth + buttonGapWidth + renderedRevealWidth,
		};
		return [
			`${theme.fg("toolTitle", theme.bold(titleText))}${plainPath}${" ".repeat(pathGapWidth)}${styledDiff}${" ".repeat(buttonGapWidth)}${revealLink}`,
		];
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type !== "click" || event.button !== "left" || event.y !== 0 || (event.clickCount ?? 1) !== 1) return;
		const { toolName, rawPath } = this.options;
		const target = toolPathClickTarget(event.x, this.layout);
		const action = toolPathClickAction({ toolName, target, ctrl: event.ctrl, shift: event.shift });
		if (action === "none" || action === "terminal") return;
		if (action === "diff") this.options.onDiff?.();
		else this.options.onOpen(rawPath, action === "reveal");
		return { handled: true, render: false };
	}

	invalidate(): void {}
}

export function createToolPathHeader(options: ToolPathHeaderOptions): Component {
	if (options.toolName === "edit") return new EditToolPathHeader(options);
	const { toolName, rawPath, theme } = options;
	const plainPath = theme.underline(theme.fg("accent", rawPath));
	const linkedPath = getCapabilities().hyperlinks && options.fileUrl
		? hyperlink(plainPath, options.fileUrl)
		: plainPath;
	const styledReveal = theme.fg("muted", "[reveal]");
	const revealLink = getCapabilities().hyperlinks && options.revealUrl
		? hyperlink(styledReveal, options.revealUrl)
		: styledReveal;
	const child = new Text(`${theme.fg("toolTitle", theme.bold(`${toolName} `))}${linkedPath}  ${revealLink}`, 0, 0);
	return new MouseRegion(child, (event) => {
		if (event.type !== "click" || event.button !== "left" || (!event.ctrl && !event.shift)) return;
		options.onOpen(rawPath, event.shift);
		return { handled: true, render: false };
	});
}
