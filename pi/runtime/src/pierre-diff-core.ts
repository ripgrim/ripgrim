import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export type DiffBaseline = "agent" | "git" | "tool";
export type DiffLineKind = "context" | "add" | "delete" | "hunk" | "meta";

export interface ParsedDiffLine {
	kind: DiffLineKind;
	text: string;
	oldLine?: number;
	newLine?: number;
}

export interface ParsedDiff {
	lines: ParsedDiffLine[];
	additions: number;
	deletions: number;
}

export function parseUnifiedDiff(patch: string): ParsedDiff {
	const lines: ParsedDiffLine[] = [];
	let oldLine = 0;
	let newLine = 0;
	let additions = 0;
	let deletions = 0;
	for (const raw of patch.replace(/\r/g, "").split("\n")) {
		if (!raw) continue;
		const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
		if (hunk) {
			oldLine = Number(hunk[1]);
			newLine = Number(hunk[2]);
			lines.push({ kind: "hunk", text: raw });
			continue;
		}
		if (raw.startsWith("--- ") || raw.startsWith("+++ ") || raw.startsWith("diff ") || raw.startsWith("index ")) {
			lines.push({ kind: "meta", text: raw });
			continue;
		}
		if (raw.startsWith("+") && !raw.startsWith("+++")) {
			lines.push({ kind: "add", text: raw.slice(1), newLine: newLine++ });
			additions += 1;
			continue;
		}
		if (raw.startsWith("-") && !raw.startsWith("---")) {
			lines.push({ kind: "delete", text: raw.slice(1), oldLine: oldLine++ });
			deletions += 1;
			continue;
		}
		if (raw.startsWith(" ")) {
			lines.push({ kind: "context", text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ });
			continue;
		}
		if (!raw.startsWith("\\ No newline")) lines.push({ kind: "meta", text: raw });
	}
	return { lines, additions, deletions };
}

const MEANINGFUL_DIFF_METADATA = /^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to|similarity index|dissimilarity index|Binary files |GIT binary patch)/;

export function meaningfulDiffMetadata(diff: ParsedDiff): string[] {
	return diff.lines
		.filter((line) => line.kind === "meta" && MEANINGFUL_DIFF_METADATA.test(line.text))
		.map((line) => line.text);
}

export function agentPatch(path: string, before: string | null, after: string | null): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-pierre-diff-"));
	const name = basename(path);
	const oldPath = join(dir, `before-${name}`);
	const newPath = join(dir, `after-${name}`);
	try {
		writeFileSync(oldPath, before ?? "", "utf8");
		writeFileSync(newPath, after ?? "", "utf8");
		const result = spawnSync("diff", ["-U", "3", "--label", `a/${path}`, "--label", `b/${path}`, oldPath, newPath], {
			encoding: "utf8",
		});
		if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || "diff failed");
		return result.stdout;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export interface GitChangedPath {
	path: string;
	staged: boolean;
	unstaged: boolean;
	untracked: boolean;
	renamedFrom?: string;
}

export function parseGitStatusPorcelain(output: string): GitChangedPath[] {
	const fields = output.split("\0");
	const changed: GitChangedPath[] = [];
	for (let index = 0; index < fields.length; index++) {
		const field = fields[index];
		if (!field || field.length < 3) continue;
		const x = field[0]!;
		const y = field[1]!;
		const path = field.slice(3);
		if (!path || x === "!") continue;
		let renamedFrom: string | undefined;
		if (x === "R" || x === "C" || y === "R" || y === "C") renamedFrom = fields[++index] || undefined;
		changed.push({
			path,
			staged: x !== " " && x !== "?",
			unstaged: y !== " " && y !== "?",
			untracked: x === "?" && y === "?",
			...(renamedFrom ? { renamedFrom } : {}),
		});
	}
	return changed.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

export function gitChangedPaths(cwd: string): GitChangedPath[] {
	const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd, encoding: "utf8" });
	if (result.status !== 0) return [];
	return parseGitStatusPorcelain(result.stdout);
}

function noIndexPatch(cwd: string, path: string): string {
	const absolutePath = isAbsolute(path) ? path : resolve(cwd, path);
	const result = spawnSync("git", ["diff", "--no-index", "--no-ext-diff", "--unified=3", "--", "/dev/null", absolutePath], { cwd, encoding: "utf8" });
	if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || "git diff --no-index failed");
	return result.stdout;
}

export function gitPatch(cwd: string, path: string): string {
	const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", path], { cwd, encoding: "utf8" }).status === 0;
	const hasHead = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd, encoding: "utf8" }).status === 0;
	if (!tracked || !hasHead) return noIndexPatch(cwd, path);
	const result = spawnSync("git", ["diff", "HEAD", "--no-ext-diff", "--unified=3", "--", path], { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(result.stderr || "git diff HEAD failed");
	return result.stdout;
}

export interface SurfaceDimensions {
	width: number;
	height: number;
	innerWidth: number;
	bordered: boolean;
}

export function fitSurface(width: number, terminalRows: number, maxHeight = Number.POSITIVE_INFINITY): SurfaceDimensions {
	const safeWidth = Math.max(0, Math.trunc(width));
	const height = Math.max(0, Math.min(Math.trunc(terminalRows), Math.trunc(maxHeight)));
	return { width: safeWidth, height, innerWidth: Math.max(0, safeWidth - 2), bordered: safeWidth >= 2 && height >= 4 };
}

export function readTextFile(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
