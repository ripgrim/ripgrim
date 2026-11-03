import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	type Focusable,
	isKeyRelease,
	matchesKey,
	parseKey,
	truncateToWidth,
	visibleWidth,
	type TUI,
	type KeyId,
} from "@earendil-works/pi-tui";
import {
	CUSTOM_KEYBINDING_EVENT,
	CUSTOM_KEYBINDINGS_PATH,
	customKey,
	readCustomBindings,
	registerCustomKeybinding,
	type CustomKeybindingDescriptor,
} from "../../../runtime/src/custom-keybindings.ts";
import { fitSurface } from "../../../runtime/src/pierre-diff-core.ts";

interface BindingRow {
	id: string;
	label: string;
	description: string;
	section: string;
	keys: string[];
	custom: boolean;
}
type MenuResult = "saved" | "discarded" | undefined;
const NATIVE_PATH = join(getAgentDir(), "keybindings.json");

function readJson(path: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch { return {}; }
}
function pad(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
function nativeSection(id: string): string {
	if (id.startsWith("tui.")) return "Pi · Terminal UI";
	if (id.startsWith("app.session")) return "Pi · Sessions";
	if (id.startsWith("app.model") || id.startsWith("app.thinking")) return "Pi · Models";
	if (id.startsWith("app.tree")) return "Pi · Tree";
	return "Pi · Application";
}

class KeybindingMenu implements Focusable {
	focused = true;
	private selected = 0;
	private scroll = 0;
	private filter = "";
	private filterMode = false;
	private recording = false;
	private pending = new Map<string, string>();
	private confirm: "exit" | undefined;
	private confirmIndex = 2;
	constructor(
		private tui: TUI,
		private theme: Theme,
		private keybindings: KeybindingsManager,
		private customDescriptors: Map<string, CustomKeybindingDescriptor>,
		private done: (result: MenuResult) => void,
	) {}
	private rows(): BindingRow[] {
		const resolved = this.keybindings.getResolvedBindings() as Record<string, string | string[]>;
		const native = Object.entries(resolved).map(([id, value]) => {
			let description = id;
			try { description = this.keybindings.getDefinition(id as never).description; } catch {}
			return { id, label: id, description, section: nativeSection(id), keys: Array.isArray(value) ? value : value ? [value] : [], custom: false };
		});
		const configured = readCustomBindings();
		const custom = [...this.customDescriptors.values()].map((item) => ({
			id: item.id,
			label: item.label,
			description: item.description,
			section: item.section,
			keys: [configured[item.id] || item.defaultKey],
			custom: true,
		}));
		const query = this.filter.trim().toLowerCase();
		return [...custom, ...native].filter((row) => !query || `${row.id} ${row.label} ${row.description} ${row.section}`.toLowerCase().includes(query));
	}
	private dirty(): boolean { return this.pending.size > 0; }
	private current(): BindingRow | undefined { return this.rows()[this.selected]; }
	private save(): void {
		const native = readJson(NATIVE_PATH);
		const custom = readJson(CUSTOM_KEYBINDINGS_PATH);
		for (const [id, key] of this.pending) {
			if (this.customDescriptors.has(id)) custom[id] = key;
			else native[id] = key;
		}
		writeFileSync(NATIVE_PATH, `${JSON.stringify({ $schema: "https://pi.dev/schemas/keybindings.schema.json", ...native }, null, 2)}\n`, "utf8");
		writeFileSync(CUSTOM_KEYBINDINGS_PATH, `${JSON.stringify(custom, null, 2)}\n`, "utf8");
		this.pending.clear();
		this.done("saved");
	}
	private requestExit(): void {
		if (!this.dirty()) this.done(undefined);
		else { this.confirm = "exit"; this.confirmIndex = 2; }
	}
	handleInput(data: string): void {
		if (isKeyRelease(data)) return;
		if (this.confirm) {
			if (matchesKey(data, "left")) this.confirmIndex = Math.max(0, this.confirmIndex - 1);
			else if (matchesKey(data, "right")) this.confirmIndex = Math.min(2, this.confirmIndex + 1);
			else if (matchesKey(data, "escape")) this.confirm = undefined;
			else if (matchesKey(data, "return")) {
				if (this.confirmIndex === 0) this.save();
				else if (this.confirmIndex === 1) this.done("discarded");
				else this.confirm = undefined;
			}
			this.tui.requestRender(); return;
		}
		if (this.recording) {
			if (matchesKey(data, "escape")) { this.recording = false; this.tui.requestRender(); return; }
			const parsed = parseKey(data);
			if (parsed && this.current()) { this.pending.set(this.current()!.id, parsed); this.recording = false; }
			this.tui.requestRender(); return;
		}
		if (this.filterMode) {
			if (matchesKey(data, "escape") || matchesKey(data, "return")) this.filterMode = false;
			else if (matchesKey(data, "backspace")) this.filter = this.filter.slice(0, -1);
			else if (!data.includes("\x1b") && [...data].every((char) => char >= " ")) this.filter += data;
			this.selected = 0; this.scroll = 0; this.tui.requestRender(); return;
		}
		const rows = this.rows();
		if (matchesKey(data, "escape") || data === "q") this.requestExit();
		else if (matchesKey(data, "up")) this.selected = Math.max(0, this.selected - 1);
		else if (matchesKey(data, "down")) this.selected = Math.min(Math.max(0, rows.length - 1), this.selected + 1);
		else if (matchesKey(data, "pageup")) this.selected = Math.max(0, this.selected - 12);
		else if (matchesKey(data, "pagedown")) this.selected = Math.min(Math.max(0, rows.length - 1), this.selected + 12);
		else if (data === "/") { this.filterMode = true; this.filter = ""; }
		else if (data.toLowerCase() === "r") this.recording = Boolean(this.current());
		else if (matchesKey(data, "return")) {
			if (this.dirty()) this.save();
			else this.recording = Boolean(this.current());
		} else return;
		this.tui.requestRender();
	}
	render(width: number): string[] {
		const surface = fitSurface(width, Math.max(1, (this.tui.terminal.rows || 1) - 3));
		if (!surface.width || !surface.height) return [];
		const rows = this.rows();
		this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
		const current = this.current();
		const confirmText = this.confirm
			? ["Save", "Discard", "Stay"].map((option, index) => index === this.confirmIndex ? this.theme.fg("warning", `[ ${option} ]`) : `[ ${option} ]`).join(" ")
			: undefined;
		if (!surface.bordered || surface.height < 6) {
			const activeKey = current ? (this.pending.get(current.id) ?? current.keys.join(", ")) : "";
			const active = current ? `${current.label} · ${activeKey || "unbound"}` : "No bindings";
			return ["KEYBINDINGS", active, confirmText ?? (this.recording ? "Press combo · Esc" : "↑↓ · Enter/R · Esc")]
				.slice(0, surface.height)
				.map((line) => truncateToWidth(line, surface.width));
		}
		const height = surface.height;
		const inner = surface.innerWidth;
		const viewport = Math.max(1, height - 5);
		if (this.selected < this.scroll) this.scroll = this.selected;
		if (this.selected >= this.scroll + viewport) this.scroll = this.selected - viewport + 1;
		const visible = rows.slice(this.scroll, this.scroll + viewport);
		const status = confirmText
			? `Unsaved. ${confirmText} · ←→ Enter`
			: this.recording
				? this.theme.fg("warning", `Recording ${current?.label ?? "binding"}: press one combo · Esc cancel`)
				: this.theme.fg("dim", "↑↓ select · Enter/R record · Enter save · / filter · Esc close");

		if (inner < 70) {
			const border = (l: string, f: string, r: string) => this.theme.fg("border", `${l}${f.repeat(inner)}${r}`);
			const line = (value: string) => `${this.theme.fg("border", "│")}${pad(` ${value}`, inner)}${this.theme.fg("border", "│")}`;
			const output = [border("╭", "─", "╮"), line(`KEYBINDINGS · ${rows.length}${this.dirty() ? ` · ${this.pending.size} unsaved` : ""} · ${this.filterMode ? `/${this.filter}█` : this.filter || "all"}`)];
			let priorSection = "";
			for (let index = 0; index < viewport; index++) {
				const row = visible[index];
				if (!row) { output.push(line("")); continue; }
				const absolute = this.scroll + index;
				const section = row.section !== priorSection ? `${row.section} · ` : "";
				priorSection = row.section;
				const pending = this.pending.get(row.id);
				const keys = pending ? `${pending} *` : row.keys.join(", ") || "unbound";
				const marker = absolute === this.selected ? this.theme.fg("warning", "›") : " ";
				output.push(line(`${marker} ${section}${row.label} · ${keys}${absolute === this.selected ? ` · ${row.description}` : ""}`));
			}
			output.push(line(status), border("╰", "─", "╯"));
			return output.slice(0, height);
		}

		const listWidth = Math.min(72, Math.max(48, Math.floor(inner * 0.58)));
		const detailWidth = inner - listWidth - 1;
		const border = this.theme.fg("border", "│");
		const line = (left: string, right: string) => `${border}${pad(` ${left}`, listWidth)}${border}${pad(` ${right}`, detailWidth)}${border}`;
		const top = `${this.theme.fg("border", "┌")}${this.theme.fg("border", "─".repeat(listWidth))}${this.theme.fg("border", "┬")}${this.theme.fg("border", "─".repeat(detailWidth))}${this.theme.fg("border", "┐")}`;
		const output = [top, line(`KEYBINDINGS · ${rows.length}${this.dirty() ? this.theme.fg("warning", ` · ${this.pending.size} unsaved`) : ""}`, this.filterMode ? `Filter: ${this.filter}█` : `Filter: ${this.filter || "all"}`), line(this.theme.fg("border", "─".repeat(Math.max(0, listWidth - 2))), this.theme.fg("border", "─".repeat(Math.max(0, detailWidth - 2))))];
		let priorSection = "";
		for (let index = 0; index < viewport; index++) {
			const row = visible[index];
			if (!row) { output.push(line("", "")); continue; }
			const absolute = this.scroll + index;
			const section = row.section !== priorSection ? `${this.theme.fg("accent", row.section)} · ` : "";
			priorSection = row.section;
			const pending = this.pending.get(row.id);
			const keys = pending ? this.theme.fg("warning", `${pending} *`) : this.theme.fg("muted", row.keys.join(", ") || "unbound");
			const marker = absolute === this.selected ? this.theme.fg("warning", "›") : " ";
			output.push(line(`${marker} ${section}${row.label}`, absolute === this.selected ? `${keys} · ${row.description}` : keys));
		}
		output.push(line(status, current ? `${current.id}${current.custom ? " · extension" : " · Pi"}` : ""));
		output.push(`${this.theme.fg("border", "└")}${this.theme.fg("border", "─".repeat(listWidth))}${this.theme.fg("border", "┴")}${this.theme.fg("border", "─".repeat(detailWidth))}${this.theme.fg("border", "┘")}`);
		return output.slice(0, height);
	}

	invalidate(): void {}
}

async function openMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, customDescriptors: Map<string, CustomKeybindingDescriptor>): Promise<void> {
	if (ctx.mode !== "tui") return;
	const sidebarRequest: { action: "hide"; wasVisible?: boolean } = { action: "hide" };
	pi.events.emit("grim:atelier-sidebar", sidebarRequest);
	try {
		const result = await ctx.ui.custom<MenuResult>((tui, theme, keybindings, done) => new KeybindingMenu(tui, theme, keybindings, customDescriptors, done));
		if (result === "saved") ctx.ui.notify("Keybindings saved. Run /reload to activate them.", "info");
		else if (result === "discarded") ctx.ui.notify("Unsaved keybinding changes discarded.", "info");
	} finally {
		if (sidebarRequest.wasVisible) pi.events.emit("grim:atelier-sidebar", { action: "show" });
	}
}

export default function keybindingManager(pi: ExtensionAPI): void {
	const customDescriptors = new Map<string, CustomKeybindingDescriptor>();
	pi.events.on(CUSTOM_KEYBINDING_EVENT, (event) => {
		if (!event || typeof event !== "object") return;
		const data = event as { type?: string; id?: string; descriptor?: CustomKeybindingDescriptor };
		if (data.type === "register" && data.descriptor) customDescriptors.set(data.descriptor.id, data.descriptor);
		else if (data.type === "unregister" && data.id) customDescriptors.delete(data.id);
	});
	pi.events.emit(CUSTOM_KEYBINDING_EVENT, { type: "discover", requestId: `keybinds-${Date.now()}` });
	registerCustomKeybinding(pi, { id: "keybinds.open", label: "Open keybindings", description: "Open the interactive Pi and extension keybinding manager", defaultKey: "f10", section: "Grim extensions" });
	pi.registerShortcut(customKey("keybinds.open", "f10"), { description: "Open keybinding manager", handler: async (ctx) => openMenu(pi, ctx, customDescriptors) });
	pi.registerCommand("keybinds", { description: "Open the interactive Pi and extension keybinding manager", handler: async (_args, ctx) => openMenu(pi, ctx, customDescriptors) });
}
