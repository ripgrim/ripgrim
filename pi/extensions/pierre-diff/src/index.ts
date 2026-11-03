import { unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type TUI,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerSidebarPanel } from "../../atelier/vendor/pi-atelier/src/sidebar-panels.ts";
import { customKey, registerCustomKeybinding } from "../../../runtime/src/custom-keybindings.ts";
import {
	agentPatch,
	type DiffBaseline,
	fitSurface,
	gitChangedPaths,
	gitPatch,
	meaningfulDiffMetadata,
	parseUnifiedDiff,
	type ParsedDiff,
	type ParsedDiffLine,
	readTextFile,
} from "../../../runtime/src/pierre-diff-core.ts";
import { createJsonlTailState, readJsonlTail } from "../../../runtime/src/incremental-jsonl.ts";

interface ChangeEntry {
	actorKey: string;
	actorLabel: string;
	runId?: string;
	absolutePath: string;
	displayPath: string;
	before: string | null;
	after: string | null;
	startedAt: number;
	updatedAt: number;
}
interface ChangeItem { entry: ChangeEntry; diff: ParsedDiff }
interface ChangeGroup { key: string; label: string; items: ChangeItem[] }

const MAIN_ACTOR = "main";
const groups = new Map<string, Map<string, ChangeEntry>>();
const pendingMain = new Map<string, string>();
let activeCwd = process.cwd();
let journalPath: string | undefined;
let journalTail = createJsonlTailState();
let journalTimer: ReturnType<typeof setInterval> | undefined;
let requestWorkspaceRender: (() => void) | undefined;
let previousJournalEnv: string | undefined;
let previousTrackerEnv: string | undefined;
let changeVersion = 0;
let cachedGroupsVersion = -1;
let cachedGroups: ChangeGroup[] = [];
let cachedFilesVersion = -1;
let cachedFiles: Array<{ path: string; displayPath: string; diff: ParsedDiff }> = [];
const diffCache = new WeakMap<ChangeEntry, { updatedAt: number; diff: ParsedDiff }>();

function pad(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
function lineNumber(value: number | undefined, width: number, theme: Theme): string {
	return theme.fg("dim", String(value ?? "").padStart(width));
}
function entryPatch(entry: ChangeEntry): string {
	return agentPatch(entry.displayPath, entry.before, entry.after);
}
function entryDiff(entry: ChangeEntry): ParsedDiff {
	const cached = diffCache.get(entry);
	if (cached?.updatedAt === entry.updatedAt) return cached.diff;
	const diff = parseUnifiedDiff(entryPatch(entry));
	diffCache.set(entry, { updatedAt: entry.updatedAt, diff });
	return diff;
}
function actorMap(key: string): Map<string, ChangeEntry> {
	let map = groups.get(key);
	if (!map) groups.set(key, map = new Map());
	return map;
}
function actorLabel(actor: string, runId?: string): string {
	if (actor === MAIN_ACTOR) return "Main agent";
	const suffix = runId && runId !== actor ? ` · ${runId.slice(0, 8)}` : "";
	return `${actor}${suffix}`;
}
function recordBefore(input: Omit<ChangeEntry, "after" | "updatedAt">): void {
	const map = actorMap(input.actorKey);
	if (map.has(input.absolutePath)) return;
	map.set(input.absolutePath, { ...input, after: input.before, updatedAt: input.startedAt });
	changeVersion++;
}
function recordAfter(actorKey: string, absolutePath: string, after: string | null, ts: number): void {
	const entry = groups.get(actorKey)?.get(absolutePath);
	if (!entry) return;
	entry.after = after;
	entry.updatedAt = ts;
	changeVersion++;
}
function allChangeGroups(): ChangeGroup[] {
	if (cachedGroupsVersion === changeVersion) return cachedGroups;
	const result: ChangeGroup[] = [];
	for (const [key, entries] of groups) {
		const items = [...entries.values()]
			.map((entry) => ({ entry, diff: entryDiff(entry) }))
			.filter(({ diff }) => diff.additions > 0 || diff.deletions > 0)
			.sort((a, b) => a.entry.displayPath.localeCompare(b.entry.displayPath));
		if (items.length) result.push({ key, label: items[0]!.entry.actorLabel, items });
	}
	cachedGroups = result.sort((a, b) => a.key === MAIN_ACTOR ? -1 : b.key === MAIN_ACTOR ? 1 : a.label.localeCompare(b.label));
	cachedGroupsVersion = changeVersion;
	return cachedGroups;
}
function uniqueSessionFiles(): Array<{ path: string; displayPath: string; diff: ParsedDiff }> {
	if (cachedFilesVersion === changeVersion) return cachedFiles;
	const byPath = new Map<string, ChangeEntry[]>();
	for (const group of groups.values()) for (const entry of group.values()) {
		const values = byPath.get(entry.absolutePath) ?? [];
		values.push(entry);
		byPath.set(entry.absolutePath, values);
	}
	cachedFiles = [...byPath.entries()].flatMap(([path, entries]) => {
		entries.sort((a, b) => a.startedAt - b.startedAt);
		const first = entries[0]!;
		const current = readTextFile(path);
		const diff = entries.length === 1 && first.after === current
			? entryDiff(first)
			: parseUnifiedDiff(agentPatch(first.displayPath, first.before, current));
		return diff.additions || diff.deletions ? [{ path, displayPath: first.displayPath, diff }] : [];
	}).sort((a, b) => a.displayPath.localeCompare(b.displayPath));
	cachedFilesVersion = changeVersion;
	return cachedFiles;
}

function metadataRows(diff: ParsedDiff, width: number, theme: Theme): string[] {
	return meaningfulDiffMetadata(diff).map((line) => theme.fg("accent", truncateToWidth(line, Math.max(1, width), "…")));
}

function hasRenderableDiffLines(diff: ParsedDiff): boolean {
	return diff.lines.some((line) => line.kind !== "meta");
}

function stackedRowsWindow(diff: ParsedDiff, width: number, theme: Theme, offset: number, limit: number): string[] {
	if (!hasRenderableDiffLines(diff)) return metadataRows(diff, width, theme).slice(offset, offset + limit);
	const maxNumber = Math.max(1, ...diff.lines.flatMap((line) => [line.oldLine ?? 0, line.newLine ?? 0]));
	const gutter = Math.max(3, String(maxNumber).length);
	const contentWidth = Math.max(8, width - gutter * 2 - 5);
	const rows: string[] = [];
	let rendered = 0;
	const collect = (values: string[]) => {
		for (const value of values) {
			if (rendered >= offset && rows.length < limit) rows.push(value);
			rendered++;
			if (rows.length >= limit) return true;
		}
		return false;
	};
	for (const line of diff.lines) {
		if (line.kind === "meta") continue;
		if (line.kind === "hunk") {
			if (collect([theme.fg("accent", ` ${" ".repeat(gutter * 2 + 3)}${truncateToWidth(line.text, contentWidth, "…")}`)])) break;
			continue;
		}
		const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
		const role = line.kind === "add" ? "success" : line.kind === "delete" ? "error" : "muted";
		const prefix = `${lineNumber(line.oldLine, gutter, theme)} ${lineNumber(line.newLine, gutter, theme)} ${theme.fg(role, marker)} `;
		const wrapped = wrapTextWithAnsi(line.text || " ", contentWidth).map((part, index) => index === 0 ? `${prefix}${theme.fg(role, part)}` : `${" ".repeat(gutter * 2 + 5)}${theme.fg(role, part)}`);
		if (collect(wrapped)) break;
	}
	return rows;
}

function stackedRows(diff: ParsedDiff, width: number, theme: Theme): string[] {
	if (!hasRenderableDiffLines(diff)) return metadataRows(diff, width, theme);
	const maxNumber = Math.max(1, ...diff.lines.flatMap((line) => [line.oldLine ?? 0, line.newLine ?? 0]));
	const gutter = Math.max(3, String(maxNumber).length);
	const contentWidth = Math.max(8, width - gutter * 2 - 5);
	return diff.lines.flatMap((line) => {
		if (line.kind === "hunk") return [theme.fg("accent", ` ${" ".repeat(gutter * 2 + 3)}${truncateToWidth(line.text, contentWidth, "…")}`)];
		if (line.kind === "meta") return [];
		const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
		const role = line.kind === "add" ? "success" : line.kind === "delete" ? "error" : "muted";
		const prefix = `${lineNumber(line.oldLine, gutter, theme)} ${lineNumber(line.newLine, gutter, theme)} ${theme.fg(role, marker)} `;
		const wrapped = wrapTextWithAnsi(line.text || " ", contentWidth);
		return wrapped.map((part, index) => index === 0 ? `${prefix}${theme.fg(role, part)}` : `${" ".repeat(gutter * 2 + 5)}${theme.fg(role, part)}`);
	});
}
interface SplitPair { left?: ParsedDiffLine; right?: ParsedDiffLine; banner?: string }
function splitPairs(lines: ParsedDiffLine[]): SplitPair[] {
	const pairs: SplitPair[] = [];
	for (let index = 0; index < lines.length;) {
		const line = lines[index]!;
		if (line.kind === "meta") { index++; continue; }
		if (line.kind === "hunk") { pairs.push({ banner: line.text }); index++; continue; }
		if (line.kind === "context") { pairs.push({ left: line, right: line }); index++; continue; }
		const deletes: ParsedDiffLine[] = [];
		const adds: ParsedDiffLine[] = [];
		while (lines[index]?.kind === "delete") deletes.push(lines[index++]!);
		while (lines[index]?.kind === "add") adds.push(lines[index++]!);
		for (let pair = 0; pair < Math.max(deletes.length, adds.length); pair++) pairs.push({ left: deletes[pair], right: adds[pair] });
		if (!deletes.length && !adds.length) index++;
	}
	return pairs;
}
function splitRows(diff: ParsedDiff, width: number, theme: Theme): string[] {
	if (!hasRenderableDiffLines(diff)) return metadataRows(diff, width, theme);
	const gap = theme.fg("border", " │ ");
	const columnWidth = Math.max(16, Math.floor((width - visibleWidth(gap)) / 2));
	const codeWidth = Math.max(8, columnWidth - 6);
	return splitPairs(diff.lines).flatMap((pair) => {
		if (pair.banner) return [theme.fg("accent", ` ${truncateToWidth(pair.banner, width - 1, "…")}`)];
		const side = (line: ParsedDiffLine | undefined, kind: "old" | "new") => {
			if (!line) return " ".repeat(columnWidth);
			const number = kind === "old" ? line.oldLine : line.newLine;
			const role = line.kind === "add" ? "success" : line.kind === "delete" ? "error" : "muted";
			const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
			return pad(`${lineNumber(number, 4, theme)} ${theme.fg(role, marker)} ${theme.fg(role, truncateToWidth(line.text, codeWidth, "…"))}`, columnWidth);
		};
		return [`${side(pair.left, "old")}${gap}${side(pair.right, "new")}`];
	});
}

class PierreDiffView implements Focusable {
	focused = true;
	private scroll = 0;
	private split = false;
	constructor(private tui: TUI, private theme: Theme, private done: () => void, private file: string, private baseline: DiffBaseline, private diff: ParsedDiff) {}
	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q") return this.done();
		if (matchesKey(data, "up")) this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "down")) this.scroll++;
		else if (matchesKey(data, "pageup")) this.scroll = Math.max(0, this.scroll - 12);
		else if (matchesKey(data, "pagedown")) this.scroll += 12;
		else if (matchesKey(data, "home")) this.scroll = 0;
		else if (data.toLowerCase() === "s") this.split = !this.split;
		else return;
		this.tui.requestRender();
	}
	render(width: number): string[] {
		const surface = fitSurface(width, Math.max(1, (this.tui.terminal.rows || 1) - 2), 42);
		if (!surface.width || !surface.height) return [];
		const stats = `${this.theme.fg("success", `+${this.diff.additions}`)} ${this.theme.fg("error", `−${this.diff.deletions}`)}`;
		if (!surface.bordered || surface.height < 6) {
			return [this.theme.bold(this.file), stats, this.theme.fg("dim", "↑↓ · q close")]
				.slice(0, surface.height)
				.map((line) => truncateToWidth(line, surface.width));
		}
		const inner = surface.innerWidth;
		const height = surface.height;
		const canSplit = inner >= 100;
		const usingSplit = this.split && canSplit;
		const content = usingSplit ? splitRows(this.diff, Math.max(1, inner - 2), this.theme) : stackedRows(this.diff, Math.max(1, inner - 2), this.theme);
		const viewport = Math.max(1, height - 5);
		this.scroll = Math.min(this.scroll, Math.max(0, content.length - viewport));
		const visible = content.slice(this.scroll, this.scroll + viewport);
		while (visible.length < viewport) visible.push("");
		const border = (l: string, f: string, r: string) => this.theme.fg("border", `${l}${f.repeat(inner)}${r}`);
		const row = (v: string) => `${this.theme.fg("border", "│")}${pad(` ${v}`, inner)}${this.theme.fg("border", "│")}`;
		const mode = `${this.baseline} · ${usingSplit ? "split" : "stacked"}`;
		const titleWidth = Math.max(0, inner - visibleWidth(stats) - (inner >= 30 ? visibleWidth(mode) + 4 : 2));
		const header = `${this.theme.bold(truncateToWidth(this.file, titleWidth, "…"))}  ${stats}`;
		const headerRow = inner >= 30
			? `${header}${" ".repeat(Math.max(0, inner - visibleWidth(header) - visibleWidth(mode) - 2))}${this.theme.fg("dim", mode)}`
			: header;
		return [border("╭", "─", "╮"), row(headerRow), row(this.theme.fg("border", "─".repeat(Math.max(0, inner - 2)))), ...visible.map(row), row(this.theme.fg("dim", inner >= 48 ? `↑↓ scroll · PgUp/PgDn · s ${canSplit ? "layout" : "split ≥100 cols"} · q/Esc close` : "↑↓ scroll · q close")), border("╰", "─", "╯")].slice(0, height);
	}
	invalidate(): void {}
}

class ChangesWorkspace implements Focusable {
	focused = true;
	private selected = 0;
	private diffScroll = 0;
	private treeScroll = 0;
	private focus: "tree" | "diff" = "tree";
	private split = false;
	private lastTreeWidth = 38;
	constructor(private tui: TUI, private theme: Theme, private done: () => void) { requestWorkspaceRender = () => this.tui.requestRender(); }
	private flat(): Array<{ group: ChangeGroup; item: ChangeItem }> {
		return allChangeGroups().flatMap((group) => group.items.map((item) => ({ group, item })));
	}
	handleInput(data: string): void {
		const files = this.flat();
		if (matchesKey(data, "escape") || matchesKey(data, "f9") || data === "q") { requestWorkspaceRender = undefined; this.done(); return; }
		if (matchesKey(data, "tab")) this.focus = this.focus === "tree" ? "diff" : "tree";
		else if (matchesKey(data, "left")) this.focus = "tree";
		else if (matchesKey(data, "right") || matchesKey(data, "return")) this.focus = "diff";
		else if (data === "[" || data === "]") {
			if (files.length) this.selected = (this.selected + (data === "]" ? 1 : -1) + files.length) % files.length;
			this.diffScroll = 0;
		} else if (data.toLowerCase() === "s") this.split = !this.split;
		else if (matchesKey(data, "up")) {
			if (this.focus === "tree") { this.selected = Math.max(0, this.selected - 1); this.diffScroll = 0; }
			else this.diffScroll = Math.max(0, this.diffScroll - 1);
		} else if (matchesKey(data, "down")) {
			if (this.focus === "tree") { this.selected = Math.min(Math.max(0, files.length - 1), this.selected + 1); this.diffScroll = 0; }
			else this.diffScroll++;
		} else if (matchesKey(data, "pageup")) this.diffScroll = Math.max(0, this.diffScroll - 12);
		else if (matchesKey(data, "pagedown")) this.diffScroll += 12;
		else return;
		this.tui.requestRender();
	}
	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.type !== "wheel" || !event.wheelDelta) return undefined;
		const direction = Math.sign(event.wheelDelta);
		const amount = Math.max(1, Math.abs(Math.trunc(event.wheelDelta)));
		if (event.x <= this.lastTreeWidth + 1) {
			const files = this.flat();
			this.focus = "tree";
			this.selected = Math.max(0, Math.min(Math.max(0, files.length - 1), this.selected + direction * amount));
			this.diffScroll = 0;
		} else {
			this.focus = "diff";
			this.diffScroll = Math.max(0, this.diffScroll + direction * amount * 3);
		}
		return { handled: true, focus: true, render: true };
	}
	render(width: number): string[] {
		const surface = fitSurface(width, Math.max(1, (this.tui.terminal.rows || 1) - 3));
		if (!surface.width || !surface.height) return [];
		const groupSnapshot = allChangeGroups();
		const files = groupSnapshot.flatMap((group) => group.items.map((item) => ({ group, item })));
		this.selected = Math.min(this.selected, Math.max(0, files.length - 1));
		const active = files[this.selected];
		if (!surface.bordered || surface.height < 6) {
			const status = active ? `${active.item.entry.displayPath} +${active.item.diff.additions} −${active.item.diff.deletions}` : "No agent changes";
			return ["CHANGES", status, this.focus === "tree" ? "Enter diff" : "← files · ↑↓ scroll"]
				.slice(0, surface.height)
				.map((line) => truncateToWidth(line, surface.width));
		}

		const inner = surface.innerWidth;
		const height = surface.height;
		const total = uniqueSessionFiles().reduce((sum, file) => ({ add: sum.add + file.diff.additions, del: sum.del + file.diff.deletions }), { add: 0, del: 0 });
		if (inner < 68) {
			const viewport = Math.max(1, height - 4);
			let content: string[];
			let title: string;
			if (this.focus === "tree") {
				this.lastTreeWidth = surface.width;
				const treeRows: string[] = [];
				let flatIndex = 0;
				let selectedRow = 0;
				for (const group of groupSnapshot) {
					treeRows.push(this.theme.fg("accent", `▾ ${group.label}`));
					for (const item of group.items) {
						if (flatIndex === this.selected) selectedRow = treeRows.length;
						const marker = flatIndex === this.selected ? this.theme.fg("warning", "›") : " ";
						treeRows.push(`${marker} ${item.entry.displayPath} ${this.theme.fg("success", `+${item.diff.additions}`)} ${this.theme.fg("error", `−${item.diff.deletions}`)}`);
						flatIndex++;
					}
				}
				if (selectedRow < this.treeScroll) this.treeScroll = selectedRow;
				if (selectedRow >= this.treeScroll + viewport) this.treeScroll = selectedRow - viewport + 1;
				content = treeRows.slice(this.treeScroll, this.treeScroll + viewport);
				title = `CHANGES · ${files.length} · +${total.add} −${total.del}`;
			} else {
				this.lastTreeWidth = 0;
				content = active ? stackedRowsWindow(active.item.diff, Math.max(1, inner - 2), this.theme, this.diffScroll, viewport) : [this.theme.fg("dim", "No agent file changes yet")];
				if (!content.length && this.diffScroll > 0) {
					this.diffScroll = Math.max(0, this.diffScroll - viewport);
					content = active ? stackedRowsWindow(active.item.diff, Math.max(1, inner - 2), this.theme, this.diffScroll, viewport) : content;
				}
				title = active ? active.item.entry.displayPath : "No changes";
			}
			while (content.length < viewport) content.push("");
			const border = (l: string, f: string, r: string) => this.theme.fg("border", `${l}${f.repeat(inner)}${r}`);
			const row = (value: string) => `${this.theme.fg("border", "│")}${pad(` ${value}`, inner)}${this.theme.fg("border", "│")}`;
			const help = this.focus === "tree" ? "↑↓/wheel · Enter diff · F9/q" : "↑↓/wheel · ← files · [ ] file · F9/q";
			return [border("╭", "─", "╮"), row(title), ...content.map(row), row(this.theme.fg("dim", help)), border("╰", "─", "╯")].slice(0, height);
		}

		const treeWidth = Math.min(38, Math.max(28, Math.floor(inner * 0.27)));
		this.lastTreeWidth = treeWidth;
		const diffWidth = inner - treeWidth - 1;
		const treeRows: string[] = [];
		let flatIndex = 0;
		let selectedTreeRow = 0;
		for (const group of groupSnapshot) {
			treeRows.push(this.theme.fg("accent", `▾ ${group.label}`));
			for (const item of group.items) {
				const selected = flatIndex === this.selected;
				if (selected) selectedTreeRow = treeRows.length;
				const dir = item.entry.displayPath.includes("/") ? item.entry.displayPath.slice(0, item.entry.displayPath.lastIndexOf("/") + 1) : "";
				const name = item.entry.displayPath.slice(dir.length);
				const stats = `${this.theme.fg("success", `+${item.diff.additions}`)} ${this.theme.fg("error", `−${item.diff.deletions}`)}`;
				const prefix = selected ? this.theme.fg("warning", "›") : " ";
				treeRows.push(`${prefix} ${this.theme.fg("dim", dir)}${name} ${stats}`);
				flatIndex++;
			}
		}
		const treeViewport = Math.max(1, height - 5);
		if (selectedTreeRow < this.treeScroll) this.treeScroll = selectedTreeRow;
		if (selectedTreeRow >= this.treeScroll + treeViewport) this.treeScroll = selectedTreeRow - treeViewport + 1;
		const treeVisible = treeRows.slice(this.treeScroll, this.treeScroll + treeViewport);
		while (treeVisible.length < treeViewport) treeVisible.push("");
		const canSplit = diffWidth >= 100;
		const usingSplit = this.split && canSplit;
		const diffViewport = treeViewport;
		let diffVisible: string[];
		if (!active) diffVisible = [this.theme.fg("dim", "No agent file changes yet")];
		else if (usingSplit) {
			const allRows = splitRows(active.item.diff, Math.max(1, diffWidth - 2), this.theme);
			this.diffScroll = Math.min(this.diffScroll, Math.max(0, allRows.length - diffViewport));
			diffVisible = allRows.slice(this.diffScroll, this.diffScroll + diffViewport);
		} else {
			diffVisible = stackedRowsWindow(active.item.diff, Math.max(1, diffWidth - 2), this.theme, this.diffScroll, diffViewport);
			if (!diffVisible.length && this.diffScroll > 0) {
				this.diffScroll = Math.max(0, this.diffScroll - diffViewport);
				diffVisible = stackedRowsWindow(active.item.diff, Math.max(1, diffWidth - 2), this.theme, this.diffScroll, diffViewport);
			}
		}
		while (diffVisible.length < diffViewport) diffVisible.push("");
		const treeTitle = `${this.focus === "tree" ? this.theme.fg("warning", "◆") : "◇"} CHANGES`;
		const fileTitle = active ? `${active.item.entry.displayPath}  ${this.theme.fg("success", `+${active.item.diff.additions}`)} ${this.theme.fg("error", `−${active.item.diff.deletions}`)} · ${usingSplit ? "split" : "stacked"}` : "No changes";
		const top = `${this.theme.fg("border", "┌")}${this.theme.fg("border", "─".repeat(treeWidth))}${this.theme.fg("border", "┬")}${this.theme.fg("border", "─".repeat(diffWidth))}${this.theme.fg("border", "┐")}`;
		const row = (left: string, right: string) => `${this.theme.fg("border", "│")}${pad(` ${left}`, treeWidth)}${this.theme.fg("border", "│")}${pad(` ${right}`, diffWidth)}${this.theme.fg("border", "│")}`;
		const rows = [top, row(`${treeTitle} · ${files.length} edits ${this.theme.fg("success", `+${total.add}`)} ${this.theme.fg("error", `−${total.del}`)}`, `${this.focus === "diff" ? this.theme.fg("warning", "◆") : "◇"} ${fileTitle}`), row(this.theme.fg("border", "─".repeat(Math.max(0, treeWidth - 2))), this.theme.fg("border", "─".repeat(Math.max(0, diffWidth - 2))))];
		for (let i = 0; i < treeViewport; i++) rows.push(row(treeVisible[i]!, diffVisible[i]!));
		rows.push(row(this.theme.fg("dim", "↑↓/wheel select · Enter diff"), this.theme.fg("dim", `wheel scroll · Tab focus · [ ] file · s layout · F9/q close`)));
		rows.push(`${this.theme.fg("border", "└")}${this.theme.fg("border", "─".repeat(treeWidth))}${this.theme.fg("border", "┴")}${this.theme.fg("border", "─".repeat(diffWidth))}${this.theme.fg("border", "┘")}`);
		return rows.slice(0, height);
	}

	invalidate(): void {}
}

function ingestJournal(): boolean {
	if (!journalPath) return false;
	const result = readJsonlTail<Record<string, unknown>>(journalPath, journalTail);
	let changed = false;
	for (const record of result.records) {
		const actor = typeof record.actor === "string" ? record.actor : "subagent";
		const runId = typeof record.runId === "string" ? record.runId : undefined;
		const actorKey = `subagent:${runId ?? actor}`;
		const absolutePath = typeof record.path === "string" ? record.path : "";
		if (!absolutePath) continue;
		if (record.type === "snapshot") {
			recordBefore({ actorKey, actorLabel: actorLabel(actor, runId), runId, absolutePath, displayPath: typeof record.displayPath === "string" ? record.displayPath : relative(activeCwd, absolutePath), before: typeof record.before === "string" ? record.before : null, startedAt: Number(record.ts) || Date.now() });
			changed = true;
		} else if (record.type === "after") {
			recordAfter(actorKey, absolutePath, typeof record.after === "string" ? record.after : null, Number(record.ts) || Date.now());
			changed = true;
		}
	}
	return changed;
}

let sidebarPanel: ReturnType<typeof registerSidebarPanel> | undefined;
function updateSidebar(force = false): void {
	const changed = ingestJournal();
	if (!force && !changed) return;
	const files = uniqueSessionFiles();
	const totals = files.reduce((sum, file) => ({ add: sum.add + file.diff.additions, del: sum.del + file.diff.deletions }), { add: 0, del: 0 });
	const actors = allChangeGroups().length;
	const rows = files.length ? files.slice(0, 3).map((file) => `${file.displayPath}  +${file.diff.additions} −${file.diff.deletions}`) : ["No agent changes"];
	sidebarPanel?.update({
		id: "grim:changes",
		title: "CHANGES",
		rows,
		keyValues: [
			{ label: `${files.length} ${files.length === 1 ? "file" : "files"}`, value: `${actors} ${actors === 1 ? "agent" : "agents"}`, labelRole: files.length ? "primary" : "dim", valueRole: "muted" },
			{ label: `+${totals.add}`, value: `−${totals.del}`, labelRole: "success", valueRole: "error" },
		],
		role: files.length ? "accent" : "muted",
	});
	requestWorkspaceRender?.();
}

function gitFiles(cwd: string): string[] {
	return gitChangedPaths(cwd).map((entry) => entry.path);
}
function trackedPaths(): string[] { return uniqueSessionFiles().map((file) => file.displayPath); }
async function choosePath(ctx: ExtensionContext, baseline: DiffBaseline, requested?: string): Promise<string | undefined> {
	if (requested?.trim()) return requested.trim();
	const files = baseline === "agent" ? trackedPaths() : gitFiles(ctx.cwd);
	if (!files.length) return undefined;
	return files.length === 1 ? files[0] : ctx.ui.select(`Pierre diff · ${baseline} baseline`, files);
}
function latestEntryForPath(absolutePath: string): ChangeEntry | undefined {
	return [...groups.values()].flatMap((map) => [...map.values()]).filter((entry) => entry.absolutePath === absolutePath).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
async function showDiff(ctx: ExtensionContext, requestedPath: string | undefined, baseline: DiffBaseline): Promise<{ ok: boolean; message: string }> {
	ingestJournal();
	if (ctx.mode !== "tui") return { ok: false, message: "Pierre diff requires interactive TUI mode." };
	const selected = await choosePath(ctx, baseline, requestedPath);
	if (!selected) return { ok: false, message: `No ${baseline === "agent" ? "agent-tracked" : "Git"} file changes are available.` };
	const absolutePath = isAbsolute(selected) ? selected : resolve(ctx.cwd, selected);
	const displayPath = relative(ctx.cwd, absolutePath) || selected;
	let patch: string;
	if (baseline === "agent") {
		const entry = latestEntryForPath(absolutePath);
		if (!entry) return { ok: false, message: `No agent edit snapshot exists for ${displayPath}. Try the git baseline.` };
		patch = entryPatch(entry);
	} else patch = gitPatch(ctx.cwd, displayPath);
	if (!patch.trim()) return { ok: false, message: `No ${baseline} diff for ${displayPath}.` };
	const parsed = parseUnifiedDiff(patch);
	await ctx.ui.custom<void>((tui, theme, _keys, done) => new PierreDiffView(tui, theme, done, displayPath, baseline, parsed), { overlay: true, overlayOptions: { anchor: "center", width: "92%", maxHeight: "94%" } });
	return { ok: true, message: `Displayed ${baseline} diff for ${displayPath}: +${parsed.additions} −${parsed.deletions}.` };
}
async function openChanges(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	ingestJournal();
	if (ctx.mode !== "tui") return;
	const sidebarRequest: { action: "hide"; wasVisible?: boolean } = { action: "hide" };
	pi.events.emit("grim:atelier-sidebar", sidebarRequest);
	try {
		await ctx.ui.custom<void>((tui, theme, _keys, done) => new ChangesWorkspace(tui, theme, done));
	} finally {
		if (sidebarRequest.wasVisible) pi.events.emit("grim:atelier-sidebar", { action: "show" });
	}
}

export default function pierreDiff(pi: ExtensionAPI): void {
	sidebarPanel = registerSidebarPanel(pi, { id: "grim:changes", title: "CHANGES", rows: ["No agent changes"], keyValues: [{ label: "0 files", value: "0 agents", labelRole: "dim", valueRole: "dim" }, { label: "+0", value: "−0", labelRole: "success", valueRole: "error" }], role: "muted" }, { source: "grim-pierre-diff" });

	pi.on("session_start", (_event, ctx) => {
		activeCwd = ctx.cwd;
		groups.clear(); pendingMain.clear(); journalTail = createJsonlTailState();
		changeVersion++; cachedGroupsVersion = -1; cachedFilesVersion = -1;
		journalPath = `${tmpdir()}/pi-pierre-changes-${process.pid}-${Date.now()}.jsonl`;
		writeFileSync(journalPath, "", { encoding: "utf8", mode: 0o600 });
		previousJournalEnv = process.env.PI_PIERRE_CHANGE_LOG;
		previousTrackerEnv = process.env.PI_PIERRE_TRACKER_EXTENSION;
		process.env.PI_PIERRE_CHANGE_LOG = journalPath;
		process.env.PI_PIERRE_TRACKER_EXTENSION = fileURLToPath(new URL("./subagent-change-journal.ts", import.meta.url));
		journalTimer = setInterval(() => updateSidebar(false), 500); journalTimer.unref();
		updateSidebar(true);
	});
	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const requested = typeof event.args?.path === "string" ? event.args.path : undefined;
		if (!requested) return;
		const absolutePath = isAbsolute(requested) ? requested : resolve(ctx.cwd, requested);
		pendingMain.set(event.toolCallId, absolutePath);
		recordBefore({ actorKey: MAIN_ACTOR, actorLabel: "Main agent", absolutePath, displayPath: relative(ctx.cwd, absolutePath) || requested, before: readTextFile(absolutePath), startedAt: Date.now() });
	});
	pi.on("tool_execution_end", (event) => {
		const path = pendingMain.get(event.toolCallId);
		if (!path) return;
		pendingMain.delete(event.toolCallId);
		if (!event.isError) recordAfter(MAIN_ACTOR, path, readTextFile(path), Date.now());
		updateSidebar(true);
	});
	pi.on("session_shutdown", () => {
		if (journalTimer) clearInterval(journalTimer);
		journalTimer = undefined;
		if (previousJournalEnv === undefined) delete process.env.PI_PIERRE_CHANGE_LOG; else process.env.PI_PIERRE_CHANGE_LOG = previousJournalEnv;
		if (previousTrackerEnv === undefined) delete process.env.PI_PIERRE_TRACKER_EXTENSION; else process.env.PI_PIERRE_TRACKER_EXTENSION = previousTrackerEnv;
		if (journalPath) { try { unlinkSync(journalPath); } catch {} }
		journalPath = undefined;
	});

	registerCustomKeybinding(pi, { id: "changes.open", label: "Open Changes", description: "Open the Fresh-inspired session file explorer and diff workspace", defaultKey: "f9", section: "Grim extensions" });
	pi.registerShortcut(customKey("changes.open", "f9"), { description: "Open session file changes", handler: async (ctx) => openChanges(pi, ctx) });
	pi.registerCommand("changes", { description: "Open the Fresh-inspired session changes workspace", handler: async (_args, ctx) => openChanges(pi, ctx) });
	pi.registerCommand("pdiff", { description: "Show a Pierre-style TUI diff for agent or Git changes", handler: async (args, ctx) => {
		const tokens = args.trim().split(/\s+/).filter(Boolean);
		const baseline: DiffBaseline = tokens[0] === "--git" || tokens[0] === "git" ? "git" : "agent";
		if (["--git", "git", "--agent", "agent"].includes(tokens[0] ?? "")) tokens.shift();
		const result = await showDiff(ctx, tokens.join(" ") || undefined, baseline);
		if (!result.ok) ctx.ui.notify(result.message, "warning");
	} });
	pi.registerTool({
		name: "show_file_diff",
		label: "Show file diff",
		description: "Open a Pierre-style TUI diff for a file. Use when the user asks to see or review changes you or a subagent made.",
		parameters: Type.Object({ path: Type.Optional(Type.String()), baseline: Type.Optional(Type.Union([Type.Literal("agent"), Type.Literal("git")], { default: "agent" })) }),
		async execute(_id, params, _signal, _update, ctx) {
			const result = await showDiff(ctx, params.path, params.baseline ?? "agent");
			return { content: [{ type: "text" as const, text: result.message }], details: result, ...(result.ok ? {} : { isError: true }) };
		},
	});
}
