import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	AssistantMessageComponent,
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type ExtensionContext,
	getMarkdownTheme,
	type Theme,
	ToolExecutionComponent,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import {
	type Component,
	CURSOR_MARKER,
	type Focusable,
	matchesKey,
	Markdown,
	renderFakeCursor,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type TUI,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import {
	appendInspectorOutput,
	cleanInspectorLines,
	findTranscriptRow,
	inspectorArgvForTarget,
	latestInspectorFrame,
	planDrawerLayout,
	renderByRevision,
	transcriptLineForViewport,
	type RevisionRenderCache,
} from "./core.ts";
import { createJsonlTailState, readJsonlTail, type JsonlTailState } from "../../../runtime/src/incremental-jsonl.ts";

const INSPECTOR_REGISTER_EVENT = "pi-subagents:inspector-register:v1";

interface InspectorContext {
	cwd: string;
	signal?: AbortSignal;
	target: {
		runId: string;
		asyncDir: string;
		index?: number;
		status: {
			cwd?: string;
			state: string;
			parentWorkflowRunId?: string;
			workflowKey?: string;
			steps?: Array<{ agent?: string; status?: string; sessionName?: string }>;
		};
	};
}
interface InspectorLaunch {
	executable: string;
	argv: string[];
	allowSteer: boolean;
	allowStop: boolean;
}
interface InspectorParams { focus?: boolean }
interface InspectorRegistration { dispose(): void }
interface InspectorRegistrationRequest {
	version: 1;
	plugin: {
		name: string;
		available(context: InspectorContext): boolean;
		owns(context: InspectorContext): boolean;
		open(context: InspectorContext, launch: InspectorLaunch, params: InspectorParams): Promise<ReturnType<typeof inspectorResult>>;
	};
	result?: { ok: true; registration: InspectorRegistration } | { ok: false; error: Error };
}

function inspectorResult(text: string, isError = false) {
	return {
		content: [{ type: "text" as const, text }],
		...(isError ? { isError: true } : {}),
		details: { mode: "management" as const, results: [] },
	};
}

interface DrawerTarget {
	runId: string;
	asyncDir: string;
	index: number;
	label: string;
	cwd: string;
	state: string;
}

interface RenderedComponentRow {
	component: Component;
	transcriptStart: number;
	height: number;
}

interface RenderedTranscript {
	lines: string[];
	rows: RenderedComponentRow[];
}

interface TargetTranscriptCache {
	tail: JsonlTailState;
	components: Component[];
	pendingTools: Map<string, ToolExecutionComponent>;
	model: string;
	tokens: number;
	revision: number;
	rendered?: RevisionRenderCache<RenderedTranscript>;
}

interface TranscriptMouseLayout {
	viewportTop: number;
	viewportHeight: number;
	transcriptStart: number;
	topPadding: number;
	contentX: number;
	contentWidth: number;
	rows: RenderedComponentRow[];
}

function discoverDrawerTargets(context: InspectorContext): DrawerTarget[] {
	const status = context.target.status;
	if (status.parentWorkflowRunId) {
		const root = dirname(context.target.asyncDir);
		const siblings: Array<DrawerTarget & { order: string }> = [];
		try {
			for (const name of readdirSync(root)) {
				const asyncDir = join(root, name);
				let sibling: InspectorContext["target"]["status"] & { runId?: string };
				try {
					sibling = JSON.parse(readFileSync(join(asyncDir, "status.json"), "utf8"));
				} catch {
					continue;
				}
				if (sibling.parentWorkflowRunId !== status.parentWorkflowRunId || !sibling.runId) continue;
				const step = sibling.steps?.[0];
				siblings.push({
					runId: sibling.runId,
					asyncDir,
					index: 0,
					label: step?.sessionName?.split(":", 1)[0] || step?.agent || sibling.workflowKey || "worker",
					cwd: sibling.cwd ?? context.cwd,
					state: step?.status ?? sibling.state,
					order: sibling.workflowKey ?? sibling.runId,
				});
			}
		} catch {
			// Fall through to the current target when retention data is unavailable.
		}
		if (siblings.length > 1) {
			siblings.sort((left, right) => left.order.localeCompare(right.order, undefined, { numeric: true }));
			return siblings.map(({ order: _order, ...target }) => target);
		}
	}

	const steps = status.steps ?? [];
	if (steps.length > 1) {
		return steps.map((step, index) => ({
			runId: context.target.runId,
			asyncDir: context.target.asyncDir,
			index,
			label: step.sessionName?.split(":", 1)[0] || step.agent || `child ${index + 1}`,
			cwd: status.cwd ?? context.cwd,
			state: step.status ?? status.state,
		}));
	}
	return [{
		runId: context.target.runId,
		asyncDir: context.target.asyncDir,
		index: context.target.index ?? 0,
		label: steps[0]?.sessionName?.split(":", 1)[0] || steps[0]?.agent || status.workflowKey || "worker",
		cwd: status.cwd ?? context.cwd,
		state: steps[0]?.status ?? status.state,
	}];
}

const INSPECTOR_TOOL_LINE = /^(bash|read|write|edit|codemode|subagent|show_file_diff|ask_user_question|plannotator)(?::|\s)/i;

function renderInspectorTranscript(lines: string[], width: number, theme: Theme): string[] {
	const rendered: string[] = [];
	let markdown: string[] = [];
	const flushMarkdown = () => {
		if (!markdown.length) return;
		const text = markdown.join("\n").trim();
		if (text) rendered.push(...new Markdown(text, 0, 0, getMarkdownTheme()).render(width));
		markdown = [];
	};
	for (const line of lines) {
		const plain = line.trim();
		if (plain.startsWith("State:")) {
			flushMarkdown();
			const state = plain.slice("State:".length).trim();
			const role = /failed|error|stopped/i.test(state) ? "error" : /completed|done/i.test(state) ? "success" : "warning";
			rendered.push(`${theme.fg(role, "●")} ${theme.bold(state)}`);
		} else if (plain.startsWith("Task:")) {
			flushMarkdown();
			rendered.push(theme.fg("accent", theme.bold("TASK")));
			rendered.push(...wrapTextWithAnsi(theme.fg("muted", plain.slice("Task:".length).trim()), width));
		} else if (INSPECTOR_TOOL_LINE.test(plain)) {
			flushMarkdown();
			const split = plain.indexOf(":");
			const firstSpace = plain.indexOf(" ");
			const boundary = split >= 0 && (firstSpace < 0 || split < firstSpace) ? split : firstSpace;
			const tool = boundary > 0 ? plain.slice(0, boundary) : plain;
			const detail = boundary > 0 ? plain.slice(boundary + 1).trim() : "";
			rendered.push(...wrapTextWithAnsi(`${theme.fg("accent", "→")} ${theme.fg("toolTitle", theme.bold(tool))}${detail ? ` ${theme.fg("muted", detail)}` : ""}`, width));
		} else markdown.push(line);
	}
	flushMarkdown();
	return rendered;
}

export class InspectorDrawer implements Focusable {
	focused = true;
	private output = "";
	private readonly transcriptCaches = new Map<string, TargetTranscriptCache>();
	private transcriptMouseLayout?: TranscriptMouseLayout;
	private queuedGuidance: string[] = [];
	private input = "";
	private cursor = 0;
	private scrollOffset = 0;
	private followTail = true;
	private stopArmed = false;
	private closed = false;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly done: () => void;
	private child: ChildProcessWithoutNullStreams;
	private childGeneration = 0;
	private readonly allowStop: boolean;
	private readonly targets: DrawerTarget[];
	private readonly createChild: (target: DrawerTarget) => ChildProcessWithoutNullStreams;
	private currentPosition: number;

	constructor(
		tui: TUI,
		theme: Theme,
		done: () => void,
		child: ChildProcessWithoutNullStreams,
		allowStop: boolean,
		targets: DrawerTarget[],
		initialPosition: number,
		createChild: (target: DrawerTarget) => ChildProcessWithoutNullStreams,
	) {
		this.tui = tui;
		this.theme = theme;
		this.done = done;
		this.child = child;
		this.allowStop = allowStop;
		this.targets = targets;
		this.currentPosition = initialPosition;
		this.createChild = createChild;
		this.bindChild(child);
	}

	private toolDefinition(name: string, cwd: string) {
		switch (name) {
			case "bash": return createBashToolDefinition(cwd);
			case "read": return createReadToolDefinition(cwd);
			case "edit": return createEditToolDefinition(cwd);
			case "write": return createWriteToolDefinition(cwd);
			case "grep": return createGrepToolDefinition(cwd);
			case "find": return createFindToolDefinition(cwd);
			case "ls": return createLsToolDefinition(cwd);
			default: return undefined;
		}
	}

	private targetKey(target: DrawerTarget): string {
		return `${target.runId}:${target.index}:${target.asyncDir}`;
	}

	private currentTranscript(): TargetTranscriptCache {
		const target = this.targets[this.currentPosition]!;
		const key = this.targetKey(target);
		let cache = this.transcriptCaches.get(key);
		if (!cache) {
			cache = {
				tail: createJsonlTailState(),
				components: [],
				pendingTools: new Map(),
				model: "",
				tokens: 0,
				revision: 0,
			};
			this.transcriptCaches.set(key, cache);
		}
		return cache;
	}

	private resetTranscript(cache: TargetTranscriptCache): void {
		cache.components = [];
		cache.pendingTools.clear();
		cache.model = "";
		cache.tokens = 0;
		cache.revision++;
		cache.rendered = undefined;
	}

	private applyMessage(cache: TargetTranscriptCache, target: DrawerTarget, message: Record<string, unknown>): void {
		const role = message.role;
		if (role === "user") {
			const content = message.content;
			const text = typeof content === "string" ? content : Array.isArray(content)
				? content.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
					.filter((item) => item.type === "text" && typeof item.text === "string")
					.map((item) => String(item.text)).join("\n")
				: "";
			if (!text) return;
			if (cache.components.length) cache.components.push({ render: () => [""], invalidate() {} });
			cache.components.push(new UserMessageComponent(text, getMarkdownTheme(), 0));
			const queuedCount = this.queuedGuidance.length;
			this.queuedGuidance = this.queuedGuidance.filter((queued) => !text.includes(queued));
			if (this.queuedGuidance.length !== queuedCount) cache.rendered = undefined;
		} else if (role === "assistant") {
			cache.components.push(new AssistantMessageComponent(message as never, false, getMarkdownTheme(), "Thinking…", 0));
			if (typeof message.provider === "string" && typeof message.model === "string") cache.model = `${message.provider}/${message.model}`;
			const usage = message.usage;
			if (usage && typeof usage === "object" && typeof (usage as Record<string, unknown>).totalTokens === "number") {
				cache.tokens = (usage as Record<string, number>).totalTokens;
			}
			const content = Array.isArray(message.content) ? message.content : [];
			for (const item of content) {
				if (!item || typeof item !== "object") continue;
				const call = item as Record<string, unknown>;
				if (call.type !== "toolCall" || typeof call.name !== "string" || typeof call.id !== "string") continue;
				const component = new ToolExecutionComponent(
					call.name,
					call.id,
					call.arguments ?? {},
					{ showImages: false, outputPad: 0 },
					this.toolDefinition(call.name, target.cwd),
					this.tui,
					target.cwd,
				);
				component.setExpanded(true);
				cache.components.push(component);
				cache.pendingTools.set(call.id, component);
			}
		} else if (role === "toolResult" && typeof message.toolCallId === "string") {
			const component = cache.pendingTools.get(message.toolCallId);
			if (!component) return;
			component.updateResult({
				content: Array.isArray(message.content) ? message.content as Array<{ type: string; text?: string; data?: string; mimeType?: string }> : [],
				details: message.details,
				isError: message.isError === true,
				durationMs: typeof message.durationMs === "number" ? message.durationMs : undefined,
			});
			cache.pendingTools.delete(message.toolCallId);
		} else return;
		cache.revision++;
		cache.rendered = undefined;
	}

	private refreshTranscript(): TargetTranscriptCache {
		const target = this.targets[this.currentPosition]!;
		const cache = this.currentTranscript();
		const result = readJsonlTail<Record<string, unknown>>(join(target.asyncDir, "events.jsonl"), cache.tail);
		if (result.reset) this.resetTranscript(cache);
		for (const event of result.records) {
			if (event.stepIndex === target.index) {
				const previous = target.state;
				if (event.type === "subagent.step.completed") target.state = "complete";
				else if (event.type === "subagent.step.failed") target.state = "failed";
				else if (event.type === "subagent.step.stopped") target.state = "stopped";
				if (target.state !== previous) {
					cache.revision++;
					cache.rendered = undefined;
				}
			}
			if (event.type !== "message_end" || event.subagentStepIndex !== target.index) continue;
			if (event.message && typeof event.message === "object") this.applyMessage(cache, target, event.message as Record<string, unknown>);
		}
		if (result.hasMore) this.tui.requestRender();
		return cache;
	}

	private bindChild(child: ChildProcessWithoutNullStreams): void {
		const generation = ++this.childGeneration;
		child.stdout.on("data", (chunk) => {
			if (generation === this.childGeneration) this.receive(String(chunk));
		});
		child.stderr.on("data", (chunk) => {
			if (generation === this.childGeneration) this.receive(`\n${this.theme.fg("error", String(chunk))}`);
		});
		child.on("exit", (code, signal) => {
			if (generation !== this.childGeneration || this.closed) return;
			this.receive(`\nInspector process closed${signal ? ` (${signal})` : code ? ` (exit ${code})` : ""}.`);
		});
	}

	private cycle(direction: -1 | 1): void {
		if (this.targets.length < 2) return;
		this.currentPosition = (this.currentPosition + direction + this.targets.length) % this.targets.length;
		const nextTarget = this.targets[this.currentPosition]!;
		this.childGeneration += 1;
		if (!this.child.killed) this.child.kill("SIGTERM");
		this.output = "";
		this.transcriptMouseLayout = undefined;
		this.queuedGuidance = [];
		this.scrollOffset = 0;
		this.followTail = true;
		this.stopArmed = false;
		this.child = this.createChild(nextTarget);
		this.bindChild(this.child);
	}

	private receive(chunk: string): void {
		this.output = appendInspectorOutput(this.output, chunk);
		if (this.followTail) this.scrollOffset = 0;
		this.tui.requestRender();
	}

	private send(command: string): void {
		if (!command.trim() || this.child.stdin.destroyed) return;
		if (command !== "status" && command !== "stop") {
			this.queuedGuidance.push(command);
			this.currentTranscript().rendered = undefined;
		}
		this.child.stdin.write(`${command}\n`);
		this.input = "";
		this.cursor = 0;
		this.followTail = true;
		this.scrollOffset = 0;
		this.stopArmed = false;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.close();
			return;
		}
		if (matchesKey(data, "ctrl+s")) {
			this.send("status");
		} else if (matchesKey(data, "ctrl+x")) {
			if (!this.allowStop) return;
			if (this.stopArmed) this.send("stop");
			else this.stopArmed = true;
		} else if (matchesKey(data, "pageup") || matchesKey(data, "up")) {
			this.followTail = false;
			this.scrollOffset += matchesKey(data, "pageup") ? 8 : 1;
		} else if (matchesKey(data, "pagedown") || matchesKey(data, "down")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - (matchesKey(data, "pagedown") ? 8 : 1));
			this.followTail = this.scrollOffset === 0;
		} else if (matchesKey(data, "return")) {
			this.send(this.input || "status");
		} else if (matchesKey(data, "backspace")) {
			if (this.cursor > 0) {
				this.input = this.input.slice(0, this.cursor - 1) + this.input.slice(this.cursor);
				this.cursor -= 1;
			}
		} else if (matchesKey(data, "left")) {
			this.cycle(-1);
		} else if (matchesKey(data, "right")) {
			this.cycle(1);
		} else if (matchesKey(data, "ctrl+u")) {
			this.input = "";
			this.cursor = 0;
		} else if (!data.includes("\x1b") && [...data].every((char) => char >= " ")) {
			this.input = this.input.slice(0, this.cursor) + data + this.input.slice(this.cursor);
			this.cursor += data.length;
		} else {
			return;
		}
		this.tui.requestRender();
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type === "wheel" && event.wheelDelta) {
			const amount = Math.max(1, Math.abs(Math.trunc(event.wheelDelta))) * 3;
			if (event.wheelDelta < 0) {
				this.followTail = false;
				this.scrollOffset += amount;
			} else {
				this.scrollOffset = Math.max(0, this.scrollOffset - amount);
				this.followTail = this.scrollOffset === 0;
			}
			return { handled: true, focus: true, render: true };
		}
		const layout = this.transcriptMouseLayout;
		if (!layout || event.y < layout.viewportTop || event.y >= layout.viewportTop + layout.viewportHeight) return undefined;
		if (event.x < layout.contentX || event.x >= layout.contentX + layout.contentWidth) return undefined;
		const viewportLine = event.y - layout.viewportTop;
		const transcriptLine = transcriptLineForViewport(viewportLine, layout.topPadding, layout.transcriptStart);
		if (transcriptLine === undefined) return undefined;
		const row = findTranscriptRow(layout.rows, transcriptLine);
		if (!row?.component.handleMouse) return undefined;
		const result = row.component.handleMouse({
			...event,
			x: event.x - layout.contentX,
			y: transcriptLine - row.transcriptStart,
			width: layout.contentWidth,
			height: row.height,
		});
		if (result?.handled || result?.render) {
			this.currentTranscript().rendered = undefined;
			this.transcriptMouseLayout = undefined;
		}
		return result;
	}

	render(width: number): string[] {
		const plan = planDrawerLayout(width, Math.max(1, (this.tui.terminal.rows || 30) - 2), this.queuedGuidance.length > 0);
		if (plan.width <= 0 || plan.height <= 0) return [];
		const target = this.targets[this.currentPosition]!;
		const cache = this.refreshTranscript();
		const identity = this.targets.length > 1
			? `${target.label} ${this.currentPosition + 1}/${this.targets.length}`
			: target.label;
		const contentWidth = Math.max(1, plan.width - (plan.bordered ? 4 : 0));
		const rendered = renderByRevision(cache.rendered, cache.revision, contentWidth, () => {
			const lines: string[] = [];
			const rows: RenderedComponentRow[] = [];
			for (const component of cache.components) {
				const componentLines = component.render(contentWidth);
				rows.push({ component, transcriptStart: lines.length, height: componentLines.length });
				lines.push(...componentLines);
			}
			return { lines, rows };
		});
		cache.rendered = rendered.cache;
		const native = rendered.cache.value;
		const transcript = native.lines.length
			? [...native.lines, ...(target.state === "running" ? ["", this.theme.fg("dim", "● Working…")] : [])]
			: renderInspectorTranscript(cleanInspectorLines(latestInspectorFrame(this.output)), contentWidth, this.theme);

		const before = this.input.slice(0, this.cursor);
		const cursorChar = this.cursor < this.input.length ? this.input[this.cursor] : " ";
		const after = this.input.slice(this.cursor + 1);
		const cursor = this.focused ? CURSOR_MARKER : "";
		const inputLine = `${this.theme.fg("accent", "> ")}${before}${cursor}${renderFakeCursor(cursorChar)}${after}`;
		if (!plan.bordered) {
			this.transcriptMouseLayout = undefined;
			const status = transcript.at(-1) ?? `${target.state}`;
			const compact = [this.theme.bold(identity), status, inputLine];
			return compact.slice(0, plan.height).map((line) => truncateToWidth(line, plan.width));
		}

		const innerWidth = plan.width - 2;
		const border = (left: string, fill: string, right: string) =>
			this.theme.fg("border", `${left}${fill.repeat(innerWidth)}${right}`);
		const row = (content = "") => {
			const clipped = truncateToWidth(content, innerWidth);
			return `${this.theme.fg("border", "│")}${clipped}${" ".repeat(Math.max(0, innerWidth - visibleWidth(clipped)))}${this.theme.fg("border", "│")}`;
		};
		const spaceBetween = (left: string, right: string) => {
			const safeRight = truncateToWidth(right, innerWidth);
			const rightWidth = visibleWidth(safeRight);
			const leftLimit = Math.max(0, innerWidth - rightWidth - (rightWidth ? 1 : 0));
			const safeLeft = truncateToWidth(left, leftLimit);
			const gap = " ".repeat(Math.max(0, innerWidth - visibleWidth(safeLeft) - rightWidth));
			return `${safeLeft}${gap}${safeRight}`;
		};
		const controls = this.stopArmed
			? this.theme.fg("warning", "^X again · Esc")
			: innerWidth >= 40
				? this.theme.fg("dim", "←→ agent · wheel · ^S · ^X · Esc")
				: this.theme.fg("dim", "←→ · ^S · Esc");
		const wrapped = transcript.map((line) => ` ${line}`);
		const maxOffset = Math.max(0, wrapped.length - plan.viewportHeight);
		this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
		const start = Math.max(0, wrapped.length - plan.viewportHeight - this.scrollOffset);
		const visible = wrapped.slice(start, start + plan.viewportHeight);
		const topPadding = Math.max(0, plan.viewportHeight - visible.length);
		while (visible.length < plan.viewportHeight) visible.unshift("");
		this.transcriptMouseLayout = native.lines.length ? {
			viewportTop: 2 + (plan.showDivider ? 1 : 0),
			viewportHeight: plan.viewportHeight,
			transcriptStart: start,
			topPadding,
			contentX: 2,
			contentWidth,
			rows: native.rows,
		} : undefined;

		const targetCwd = target.cwd.startsWith(homedir()) ? `~${target.cwd.slice(homedir().length)}` : target.cwd;
		const tokenText = cache.tokens >= 1000 ? `${Math.round(cache.tokens / 1000)}k tok` : `${cache.tokens} tok`;
		const footerParts = [targetCwd, cache.tokens ? tokenText : "", cache.model, target.state].filter(Boolean);
		const output = [
			border("╭", "─", "╮"),
			row(spaceBetween(` ${this.theme.bold(identity)}`, `${controls} `)),
		];
		if (plan.showDivider) output.push(row(this.theme.fg("border", ` ${"─".repeat(Math.max(0, innerWidth - 2))}`)));
		output.push(...visible.map((line) => row(line)));
		if (plan.showQueue) output.push(row(` ${this.theme.fg("warning", "queued ›")} ${truncateToWidth(this.queuedGuidance.at(-1)!, Math.max(0, innerWidth - 11))}`));
		if (plan.showDivider) output.push(row(this.theme.fg("border", ` ${"─".repeat(Math.max(0, innerWidth - 2))}`)));
		output.push(row(` ${inputLine}`));
		if (plan.showFooter) output.push(row(` ${this.theme.fg("dim", truncateToWidth(footerParts.join(" | "), Math.max(0, innerWidth - 2)))}`));
		output.push(border("╰", "─", "╯"));
		return output.slice(0, plan.height);
	}

	invalidate(): void {
		for (const cache of this.transcriptCaches.values()) {
			for (const component of cache.components) component.invalidate();
			cache.rendered = undefined;
		}
		this.transcriptMouseLayout = undefined;
	}

	private teardown(notifyDone: boolean): void {
		if (this.closed) return;
		this.closed = true;
		this.childGeneration += 1;
		if (!this.child.killed) this.child.kill("SIGTERM");
		if (notifyDone) this.done();
	}

	close(): void {
		this.teardown(true);
	}

	dispose(): void {
		this.teardown(false);
	}
}

export default function inPiSubagentInspector(pi: ExtensionAPI): void {
	let registration: InspectorRegistration | undefined;
	let activeContext: ExtensionContext | undefined;

	pi.on("session_start", (_event, ctx) => {
		activeContext = ctx.mode === "tui" ? ctx : undefined;
		registration?.dispose();
		const request: InspectorRegistrationRequest = {
			version: 1,
			plugin: {
				name: "in-pi-drawer",
				available: () => activeContext?.mode === "tui",
				owns: () => false,
				open: async (context, launch) => {
					const ctx = activeContext;
					if (!ctx) return inspectorResult("The in-Pi inspector requires interactive TUI mode.", true);
					const cwd = context.target.status.cwd ?? context.cwd;
					const targets = discoverDrawerTargets(context);
					const initialPosition = Math.max(0, targets.findIndex((target) =>
						target.runId === context.target.runId && target.index === (context.target.index ?? 0)));
					const createChild = (target: DrawerTarget) => spawn(
						launch.executable,
						inspectorArgvForTarget(launch.argv, target),
						{ cwd, env: process.env, stdio: "pipe" },
					);
					const child = createChild(targets[initialPosition]!);
					await ctx.ui.custom<void>((tui, theme, _keybindings, done) =>
						new InspectorDrawer(
							tui,
							theme,
							done,
							child,
							launch.allowStop,
							targets,
							initialPosition,
							createChild,
						), {
						overlay: true,
						overlayOptions: {
							anchor: "right-center",
							width: "38%",
							minWidth: 2,
							maxHeight: "92%",
							margin: { right: 0 },
						},
					});
					return inspectorResult(`Closed the in-Pi inspector for async run ${context.target.runId}.`);
				},
			},
		};
		pi.events.emit(INSPECTOR_REGISTER_EVENT, request);
		if (!request.result?.ok) {
			const reason = request.result && !request.result.ok
				? request.result.error.message
				: "pi-subagents did not accept the registration";
			ctx.ui.notify(`In-Pi subagent inspector unavailable: ${reason}`, "warning");
			return;
		}
		registration = request.result.registration;
	});

	pi.on("session_shutdown", () => {
		activeContext = undefined;
		registration?.dispose();
		registration = undefined;
	});
}
