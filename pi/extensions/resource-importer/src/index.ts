import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
	discoverCandidates,
	findProjectRoot,
	getManifestPath,
	mergeSelectedCandidates,
	readImportedInstructions,
	readManifest,
	type DiscoveryRoot,
	type ImportCandidate,
	writeManifest,
} from "./core.ts";

interface ImporterConfig {
	skillRoots?: string[];
	instructionRoots?: string[];
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const promptedRoots = new Set<string>();

function expandPath(path: string): string {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return resolve(path);
}

function loadConfig(): ImporterConfig {
	const path = join(getAgentDir(), "resource-importer.json");
	if (!existsSync(path)) return {};
	try {
		return JSON.parse(readFileSync(path, "utf8")) as ImporterConfig;
	} catch {
		return {};
	}
}

function uniqueRoots(roots: DiscoveryRoot[]): DiscoveryRoot[] {
	const seen = new Set<string>();
	return roots.filter((root) => {
		const path = resolve(root.path);
		if (seen.has(path)) return false;
		seen.add(path);
		return true;
	});
}

function getDiscoveryRoots(): { skillRoots: DiscoveryRoot[]; instructionRoots: DiscoveryRoot[] } {
	const home = homedir();
	const agentDir = getAgentDir();
	const config = loadConfig();
	return {
		skillRoots: uniqueRoots([
			{ path: join(home, ".agents", "skills"), label: "user skills", maxDepth: 3 },
			{ path: join(agentDir, "skills"), label: "Pi agent skills", maxDepth: 3 },
			{ path: join(packageRoot, "skills"), label: "grim-pi package", maxDepth: 3 },
			{ path: join(home, "code"), label: "projects", maxDepth: 7 },
			...(config.skillRoots ?? []).map((path) => ({ path: expandPath(path), label: "configured", maxDepth: 7 })),
		]),
		instructionRoots: uniqueRoots([
			{ path: join(home, "code"), label: "projects", maxDepth: 5 },
			...(config.instructionRoots ?? []).map((path) => ({ path: expandPath(path), label: "configured", maxDepth: 6 })),
		]),
	};
}

function getCandidates(projectRoot: string, selectedPaths: Set<string>): ImportCandidate[] {
	const roots = getDiscoveryRoots();
	return mergeSelectedCandidates(discoverCandidates({ ...roots, excludeRoot: projectRoot }), selectedPaths);
}

async function showCheckboxPrompt(
	ctx: ExtensionContext,
	projectRoot: string,
	candidates: ImportCandidate[],
	initiallySelected: Set<string>,
): Promise<ImportCandidate[] | null> {
	if (ctx.mode !== "tui") return null;
	return ctx.ui.custom<ImportCandidate[] | null>((tui, theme, _keybindings, done) => {
		const selected = new Set(initiallySelected);
		let query = "";
		let cursor = 0;
		let cachedWidth: number | undefined;
		let cachedLines: string[] | undefined;

		const filtered = () => {
			const needle = query.trim().toLowerCase();
			if (!needle) return candidates;
			return candidates.filter((candidate) =>
				[candidate.name, candidate.description, candidate.source, candidate.kind].some((value) =>
					value.toLowerCase().includes(needle),
				),
			);
		};
		const invalidate = () => {
			cachedWidth = undefined;
			cachedLines = undefined;
		};
		const clampCursor = () => {
			const items = filtered();
			cursor = items.length === 0 ? 0 : Math.max(0, Math.min(cursor, items.length - 1));
		};
		const finish = () => done(candidates.filter((candidate) => selected.has(candidate.path)));

		return {
			render(width: number): string[] {
				if (cachedLines && cachedWidth === width) return cachedLines;
				const items = filtered();
				const viewport = Math.max(4, Math.min(12, items.length || 4));
				const start = Math.max(0, Math.min(cursor - Math.floor(viewport / 2), Math.max(0, items.length - viewport)));
				const visible = items.slice(start, start + viewport);
				const lines = [
					theme.fg("accent", theme.bold("Import reusable Pi resources")),
					theme.fg("dim", truncateToWidth(projectRoot, width)),
					`${theme.fg("muted", "Filter:")} ${query || theme.fg("dim", "type to search")}`,
					"",
				];
				if (visible.length === 0) {
					lines.push(theme.fg("warning", "  No matching resources"));
				} else {
					for (let offset = 0; offset < visible.length; offset++) {
						const candidate = visible[offset];
						const index = start + offset;
						const pointer = index === cursor ? theme.fg("accent", ">") : " ";
						const check = selected.has(candidate.path) ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
						const kind = candidate.kind === "skill" ? theme.fg("accent", "skill") : theme.fg("warning", "instructions");
						const source = theme.fg("dim", `· ${candidate.source}`);
						lines.push(truncateToWidth(`${pointer} ${check} ${kind}  ${candidate.name} ${source}`, width));
						lines.push(truncateToWidth(`      ${theme.fg("muted", candidate.description)}`, width));
					}
				}
				lines.push("");
				lines.push(
					truncateToWidth(
						theme.fg(
							"dim",
							`↑↓ move  space toggle  ctrl+a all  enter save (${selected.size})  esc ask later`,
						),
						width,
					),
				);
				cachedWidth = width;
				cachedLines = lines;
				return lines;
			},
			handleInput(data: string): void {
				const items = filtered();
				if (matchesKey(data, "up")) {
					if (items.length > 0) cursor = (cursor - 1 + items.length) % items.length;
				} else if (matchesKey(data, "down")) {
					if (items.length > 0) cursor = (cursor + 1) % items.length;
				} else if (matchesKey(data, "space")) {
					const candidate = items[cursor];
					if (candidate) {
						if (selected.has(candidate.path)) selected.delete(candidate.path);
						else selected.add(candidate.path);
					}
				} else if (matchesKey(data, "ctrl+a")) {
					const allSelected = items.length > 0 && items.every((candidate) => selected.has(candidate.path));
					for (const candidate of items) {
						if (allSelected) selected.delete(candidate.path);
						else selected.add(candidate.path);
					}
				} else if (matchesKey(data, "return")) {
					finish();
					return;
				} else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
					done(null);
					return;
				} else if (matchesKey(data, "backspace")) {
					query = query.slice(0, -1);
					cursor = 0;
				} else if (data.length === 1 && data >= "!" && data <= "~") {
					query += data;
					cursor = 0;
				} else {
					return;
				}
				clampCursor();
				invalidate();
				tui.requestRender();
			},
			invalidate,
		};
	});
}

export default function resourceImporter(pi: ExtensionAPI): void {
	async function configure(ctx: ExtensionContext, projectRoot: string): Promise<boolean> {
		const manifestPath = getManifestPath(projectRoot);
		const existing = readManifest(manifestPath);
		const selectedPaths = new Set([...(existing?.skills ?? []), ...(existing?.instructions ?? [])]);
		const candidates = getCandidates(projectRoot, selectedPaths);
		if (candidates.length === 0) {
			ctx.ui.notify("No reusable skills or instruction files were discovered", "warning");
			return false;
		}
		const result = await showCheckboxPrompt(ctx, projectRoot, candidates, selectedPaths);
		if (!result) {
			ctx.ui.notify("Resource import skipped; run /imports whenever you are ready", "info");
			return false;
		}
		const manifest = writeManifest(manifestPath, result);
		ctx.ui.notify(
			`Imported ${manifest.skills.length} skill${manifest.skills.length === 1 ? "" : "s"} and ${manifest.instructions.length} instruction file${manifest.instructions.length === 1 ? "" : "s"}`,
			"info",
		);
		return true;
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		const projectRoot = findProjectRoot(ctx.cwd);
		const manifestPath = getManifestPath(projectRoot);
		if (existsSync(manifestPath) || promptedRoots.has(projectRoot)) return;
		promptedRoots.add(projectRoot);
		await configure(ctx, projectRoot);
	});

	pi.on("resources_discover", (event) => {
		const manifest = readManifest(getManifestPath(findProjectRoot(event.cwd)));
		if (!manifest) return;
		const skillPaths = manifest.skills.filter((path) => existsSync(path));
		return skillPaths.length > 0 ? { skillPaths } : undefined;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const manifest = readManifest(getManifestPath(findProjectRoot(ctx.cwd)));
		if (!manifest) return;
		const existing = new Set(event.systemPromptOptions.contextFiles.map((file) => resolve(file.path)));
		for (const file of readImportedInstructions(manifest)) {
			if (existing.has(resolve(file.path))) continue;
			event.systemPromptOptions.contextFiles.push(file);
			existing.add(resolve(file.path));
		}
	});

	pi.registerCommand("imports", {
		description: "Choose reusable skills and instruction files for this project",
		handler: async (args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/imports requires TUI mode", "error");
				return;
			}
			const projectRoot = findProjectRoot(ctx.cwd);
			if (args.trim() === "clear") {
				writeManifest(getManifestPath(projectRoot), []);
				ctx.ui.notify("Project imports cleared; reloading resources", "info");
				await ctx.reload();
				return;
			}
			if (await configure(ctx, projectRoot)) {
				ctx.ui.notify("Reloading Pi to apply the updated imports", "info");
				await ctx.reload();
			}
		},
	});
}
