import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type ImportKind = "skill" | "instructions";

export interface ImportCandidate {
	id: string;
	kind: ImportKind;
	name: string;
	description: string;
	path: string;
	source: string;
	available?: boolean;
}

export interface ImportManifest {
	version: 1;
	initializedAt: string;
	skills: string[];
	instructions: string[];
}

export interface DiscoveryRoot {
	path: string;
	label: string;
	maxDepth?: number;
}

export interface DiscoverOptions {
	skillRoots: DiscoveryRoot[];
	instructionRoots: DiscoveryRoot[];
	excludeRoot?: string;
}

const SKIPPED_DIRECTORIES = new Set([
	".git",
	".hg",
	".svn",
	"node_modules",
	"dist",
	"build",
	"coverage",
	".next",
	".turbo",
	".cache",
	"AppData",
]);
const INSTRUCTION_NAMES = new Set(["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]);

function canonical(path: string): string {
	const absolute = resolve(path);
	try {
		return realpathSync.native(absolute);
	} catch {
		return absolute;
	}
}

function isInside(root: string, path: string): boolean {
	const child = relative(canonical(root), canonical(path));
	return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function walk(root: DiscoveryRoot, visit: (path: string, name: string) => void): void {
	const base = canonical(root.path);
	if (!existsSync(base)) return;
	const maxDepth = root.maxDepth ?? 5;
	const stack: Array<{ path: string; depth: number }> = [{ path: base, depth: 0 }];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		let entries;
		try {
			entries = readdirSync(current.path, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const path = join(current.path, entry.name);
			if (entry.isFile()) {
				visit(path, entry.name);
			} else if (entry.isDirectory() && current.depth < maxDepth && !SKIPPED_DIRECTORIES.has(entry.name)) {
				stack.push({ path, depth: current.depth + 1 });
			}
		}
	}
}

function parseSkill(path: string, source: string): ImportCandidate | undefined {
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
	const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	const block = frontmatter?.[1] ?? "";
	const declaredName = block.match(/^name:\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
	const description = block.match(/^description:\s*["']?([^\r\n"']+)/m)?.[1]?.trim();
	const skillDir = dirname(path);
	const name = declaredName || skillDir.split(/[\\/]/).pop() || "unnamed-skill";
	const skillPath = canonical(skillDir);
	return {
		id: `skill:${skillPath}`,
		kind: "skill",
		name,
		description: description || "Skill instructions and bundled resources",
		path: skillPath,
		source,
	};
}

function parseInstructions(path: string, source: string, sourceRoot: string): ImportCandidate | undefined {
	let content: string;
	try {
		content = readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
	const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	const instructionPath = canonical(path);
	return {
		id: `instructions:${instructionPath}`,
		kind: "instructions",
		name: heading || path.split(/[\\/]/).pop() || "instructions",
		description: relative(canonical(sourceRoot), instructionPath).replaceAll("\\", "/") || instructionPath,
		path: instructionPath,
		source,
	};
}

export function discoverCandidates(options: DiscoverOptions): ImportCandidate[] {
	const candidates = new Map<string, ImportCandidate>();
	for (const root of options.skillRoots) {
		walk(root, (path, name) => {
			if (name !== "SKILL.md") return;
			if (options.excludeRoot && isInside(options.excludeRoot, path)) return;
			const candidate = parseSkill(path, root.label);
			if (candidate) candidates.set(candidate.id, candidate);
		});
	}
	for (const root of options.instructionRoots) {
		walk(root, (path, name) => {
			if (!INSTRUCTION_NAMES.has(name)) return;
			if (options.excludeRoot && isInside(options.excludeRoot, path)) return;
			const candidate = parseInstructions(path, root.label, root.path);
			if (candidate) candidates.set(candidate.id, candidate);
		});
	}
	return [...candidates.values()].sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "skill" ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.path.localeCompare(b.path);
	});
}

function candidateCompare(a: ImportCandidate, b: ImportCandidate): number {
	if (a.kind !== b.kind) return a.kind === "skill" ? -1 : 1;
	const leftName = a.name.normalize("NFKC").toLowerCase();
	const rightName = b.name.normalize("NFKC").toLowerCase();
	return leftName < rightName ? -1 : leftName > rightName ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

export function dedupeCandidates(candidates: ImportCandidate[], preferredPaths = new Set<string>()): ImportCandidate[] {
	const groups = new Map<string, ImportCandidate[]>();
	for (const candidate of [...candidates].sort(candidateCompare)) {
		const key = `${candidate.kind}:${candidate.name.normalize("NFKC").toLowerCase()}`;
		const group = groups.get(key);
		if (group) group.push(candidate);
		else groups.set(key, [candidate]);
	}
	return [...groups.values()].map((group) => {
		const preferredCandidates = group.filter((candidate) => preferredPaths.has(candidate.path)).sort(candidateCompare);
		const preferred = preferredCandidates.find((candidate) => candidate.available !== false) ?? preferredCandidates[0];
		const candidate = preferred ?? group.find((item) => item.available !== false) ?? group[0]!;
		return group.length === 1 ? candidate : { ...candidate, source: `${candidate.source} · ${group.length} copies` };
	}).sort(candidateCompare);
}

export function mergeSelectedCandidates(candidates: ImportCandidate[], selectedPaths: Set<string>): ImportCandidate[] {
	const discovered = new Set(candidates.map((candidate) => candidate.path));
	const combined = [...candidates];
	for (const path of [...selectedPaths].sort()) {
		if (discovered.has(path)) continue;
		const isSkill = !path.toLowerCase().endsWith(".md");
		combined.push({
			id: `${isSkill ? "skill" : "instructions"}:${path}`,
			kind: isSkill ? "skill" : "instructions",
			name: path.split(/[\\/]/).pop() || path,
			description: "Previously imported; source is currently unavailable",
			path,
			source: "missing",
			available: false,
		});
	}
	return dedupeCandidates(combined, selectedPaths);
}

export function findProjectRoot(cwd: string): string {
	let current = canonical(cwd);
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return canonical(cwd);
		current = parent;
	}
}

export function getManifestPath(projectRoot: string): string {
	return join(projectRoot, ".pi", "resource-imports.json");
}

export function readManifest(path: string): ImportManifest | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ImportManifest>;
		if (value.version !== 1 || !Array.isArray(value.skills) || !Array.isArray(value.instructions)) return undefined;
		return {
			version: 1,
			initializedAt: typeof value.initializedAt === "string" ? value.initializedAt : "",
			skills: value.skills.filter((item): item is string => typeof item === "string"),
			instructions: value.instructions.filter((item): item is string => typeof item === "string"),
		};
	} catch {
		return undefined;
	}
}

export function writeManifest(path: string, selected: ImportCandidate[]): ImportManifest {
	const manifest: ImportManifest = {
		version: 1,
		initializedAt: new Date().toISOString(),
		skills: selected.filter((item) => item.kind === "skill").map((item) => item.path),
		instructions: selected.filter((item) => item.kind === "instructions").map((item) => item.path),
	};
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
	return manifest;
}

export function readImportedInstructions(manifest: ImportManifest): Array<{ path: string; content: string }> {
	const files: Array<{ path: string; content: string }> = [];
	for (const path of manifest.instructions) {
		try {
			if (!statSync(path).isFile()) continue;
			files.push({ path, content: readFileSync(path, "utf8") });
		} catch {
			// Missing imported resources are ignored; /imports can repair the manifest.
		}
	}
	return files;
}
