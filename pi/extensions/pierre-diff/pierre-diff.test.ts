import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { agentPatch, fitSurface, gitChangedPaths, gitPatch, meaningfulDiffMetadata, parseUnifiedDiff } from "../../runtime/src/pierre-diff-core.ts";

test("parses unified hunks with old and new line numbers", () => {
	const parsed = parseUnifiedDiff([
		"--- a/demo.ts",
		"+++ b/demo.ts",
		"@@ -1,3 +1,3 @@",
		" const a = 1;",
		"-const b = 2;",
		"+const b = 3;",
		" export { a, b };",
	].join("\n"));
	assert.equal(parsed.additions, 1);
	assert.equal(parsed.deletions, 1);
	assert.deepEqual(parsed.lines.filter((line) => line.kind === "delete")[0], {
		kind: "delete",
		text: "const b = 2;",
		oldLine: 2,
	});
	assert.deepEqual(parsed.lines.filter((line) => line.kind === "add")[0], {
		kind: "add",
		text: "const b = 3;",
		newLine: 2,
	});
});

test("creates an exact agent-baseline patch", () => {
	const patch = agentPatch("demo.txt", "one\ntwo\n", "one\nthree\n");
	assert.match(patch, /--- a\/demo\.txt/);
	assert.match(patch, /\+\+\+ b\/demo\.txt/);
	assert.match(patch, /-two/);
	assert.match(patch, /\+three/);
});

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

test("Git baseline includes staged, unstaged, and untracked working-tree changes", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-pierre-git-"));
	try {
		git(root, "init", "-q");
		git(root, "config", "user.email", "test@example.com");
		git(root, "config", "user.name", "Test");
		writeFileSync(join(root, "tracked.txt"), "base\n");
		git(root, "add", "tracked.txt");
		git(root, "commit", "-qm", "base");
		writeFileSync(join(root, "tracked.txt"), "staged\n");
		git(root, "add", "tracked.txt");
		writeFileSync(join(root, "tracked.txt"), "working\n");
		writeFileSync(join(root, "new file.txt"), "new\ntext\n");

		const paths = gitChangedPaths(root);
		assert.deepEqual(paths.map((entry) => entry.path), ["new file.txt", "tracked.txt"]);
		const tracked = paths.find((entry) => entry.path === "tracked.txt")!;
		assert.equal(tracked.staged, true);
		assert.equal(tracked.unstaged, true);
		const trackedPatch = gitPatch(root, "tracked.txt");
		assert.match(trackedPatch, /-base/);
		assert.match(trackedPatch, /\+working/);
		assert.doesNotMatch(trackedPatch, /\+staged/);
		const untrackedPatch = parseUnifiedDiff(gitPatch(root, "new file.txt"));
		assert.equal(untrackedPatch.additions, 2);
		assert.equal(untrackedPatch.deletions, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("Git baseline handles staged-only changes and an unborn repository", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-pierre-unborn-"));
	try {
		git(root, "init", "-q");
		writeFileSync(join(root, "first.txt"), "first\n");
		git(root, "add", "first.txt");
		assert.deepEqual(gitChangedPaths(root).map((entry) => entry.path), ["first.txt"]);
		const patch = parseUnifiedDiff(gitPatch(root, "first.txt"));
		assert.equal(patch.additions, 1);
		assert.equal(patch.deletions, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("metadata-only Git patches retain empty-file and mode-change notices", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-pierre-metadata-"));
	try {
		git(root, "init", "-q");
		git(root, "config", "user.email", "test@example.com");
		git(root, "config", "user.name", "Test");
		writeFileSync(join(root, "script.sh"), "echo ok\n");
		git(root, "add", "script.sh");
		git(root, "commit", "-qm", "base");

		writeFileSync(join(root, "empty.txt"), "");
		const emptyDiff = parseUnifiedDiff(gitPatch(root, "empty.txt"));
		assert.equal(emptyDiff.additions, 0);
		assert.equal(emptyDiff.deletions, 0);
		assert.deepEqual(meaningfulDiffMetadata(emptyDiff), ["new file mode 100644"]);

		chmodSync(join(root, "script.sh"), 0o755);
		const modeDiff = parseUnifiedDiff(gitPatch(root, "script.sh"));
		assert.equal(modeDiff.additions, 0);
		assert.equal(modeDiff.deletions, 0);
		assert.deepEqual(meaningfulDiffMetadata(modeDiff), ["old mode 100644", "new mode 100755"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("recognizes rename and binary metadata for metadata-only rendering", () => {
	const parsed = parseUnifiedDiff([
		"diff --git a/old.txt b/new.txt",
		"similarity index 100%",
		"rename from old.txt",
		"rename to new.txt",
		"Binary files a/blob.bin and b/blob.bin differ",
	].join("\n"));
	assert.deepEqual(meaningfulDiffMetadata(parsed), [
		"similarity index 100%",
		"rename from old.txt",
		"rename to new.txt",
		"Binary files a/blob.bin and b/blob.bin differ",
	]);
});

test("responsive diff surfaces remain bounded", () => {
	for (const width of [1, 8, 20, 39, 70, 120]) {
		for (const height of [1, 4, 8, 16, 24]) {
			const surface = fitSurface(width, height, 42);
			assert.ok(surface.width <= width);
			assert.ok(surface.height <= height);
			assert.equal(surface.innerWidth, Math.max(0, width - 2));
		}
	}
});
