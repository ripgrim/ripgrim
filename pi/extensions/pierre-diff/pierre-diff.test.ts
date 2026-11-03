import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";
import { agentPatch, fitSurface, gitChangedPaths, gitPatch, meaningfulDiffMetadata, parseUnifiedDiff } from "../../runtime/src/pierre-diff-core.ts";
import { emitPierreDiffRequest, PIERRE_DIFF_REQUEST_EVENT } from "../../runtime/src/pierre-diff-request.ts";
import {
	createToolDiffSnapshotStore,
	finishToolDiffSnapshot,
	lookupToolDiffSnapshot,
	startToolDiffSnapshot,
	toolResultPatch,
} from "../../runtime/src/tool-diff-snapshots.ts";
import { clampToolPathWidth, planToolPathHeader, toolPathClickAction, toolPathClickTarget } from "../../runtime/src/tool-path-click.ts";

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

test("retains exact result patches when parallel same-file edits start from the same baseline", () => {
	const store = createToolDiffSnapshotStore();
	const initial = "one\ntwo\n";
	const afterFirst = "ONE\ntwo\n";
	const afterSecond = "ONE\nTWO\n";
	const firstPatch = agentPatch("demo.txt", initial, afterFirst);
	const secondPatch = agentPatch("demo.txt", afterFirst, afterSecond);
	startToolDiffSnapshot(store, { toolCallId: "first", path: "/tmp/demo.txt", before: initial });
	startToolDiffSnapshot(store, { toolCallId: "second", path: "/tmp/demo.txt", before: initial });
	finishToolDiffSnapshot(store, { toolCallId: "first", after: afterFirst, patch: firstPatch });
	finishToolDiffSnapshot(store, { toolCallId: "second", after: afterSecond, patch: secondPatch });
	const first = lookupToolDiffSnapshot(store, "first");
	const second = lookupToolDiffSnapshot(store, "second");
	assert.equal(first.status, "ready");
	assert.equal(second.status, "ready");
	if (first.status === "ready" && second.status === "ready") {
		assert.match(first.snapshot.patch ?? "", /-one/);
		assert.match(first.snapshot.patch ?? "", /\+ONE/);
		assert.doesNotMatch(second.snapshot.patch ?? "", /(?:^|\n)[+-](?:one|ONE)(?:\n|$)/);
		assert.match(second.snapshot.patch ?? "", /-two/);
		assert.match(second.snapshot.patch ?? "", /\+TWO/);
		assert.equal(parseUnifiedDiff(second.snapshot.patch ?? "").additions, 1);
	}
	assert.equal(toolResultPatch({ details: { patch: secondPatch } }), secondPatch);
	startToolDiffSnapshot(store, { toolCallId: "shared", scope: "child-a", path: "/tmp/demo.txt", before: "a\n" });
	finishToolDiffSnapshot(store, { toolCallId: "shared", scope: "child-a", after: "a2\n" });
	startToolDiffSnapshot(store, { toolCallId: "shared", scope: "child-b", path: "/tmp/demo.txt", before: "b\n" });
	finishToolDiffSnapshot(store, { toolCallId: "shared", scope: "child-b", after: "b2\n" });
	const childA = lookupToolDiffSnapshot(store, "shared", "child-a");
	const childB = lookupToolDiffSnapshot(store, "shared", "child-b");
	assert.equal(childA.status === "ready" ? childA.snapshot.after : undefined, "a2\n");
	assert.equal(childB.status === "ready" ? childB.snapshot.after : undefined, "b2\n");
});

test("reports missing, pending, failed, unchanged, and unavailable tool snapshots", () => {
	const store = createToolDiffSnapshotStore();
	assert.equal(lookupToolDiffSnapshot(store, "missing").status, "missing");
	startToolDiffSnapshot(store, { toolCallId: "pending", path: "/tmp/a", before: "a" });
	assert.equal(lookupToolDiffSnapshot(store, "pending").status, "pending");
	startToolDiffSnapshot(store, { toolCallId: "failed", path: "/tmp/b", before: "b" });
	finishToolDiffSnapshot(store, { toolCallId: "failed", failed: true });
	assert.equal(lookupToolDiffSnapshot(store, "failed").status, "failed");
	startToolDiffSnapshot(store, { toolCallId: "same", path: "/tmp/c", before: "c" });
	finishToolDiffSnapshot(store, { toolCallId: "same", after: "c" });
	assert.equal(lookupToolDiffSnapshot(store, "same").status, "unchanged");
	startToolDiffSnapshot(store, { toolCallId: "unavailable", path: "/tmp/d", before: "d" });
	finishToolDiffSnapshot(store, { toolCallId: "unavailable", unavailable: true });
	assert.equal(lookupToolDiffSnapshot(store, "unavailable").status, "unavailable");
});

test("emits a direct Pierre tool-snapshot request for synchronous claiming", () => {
	const events = new EventEmitter();
	let observed: unknown;
	events.on(PIERRE_DIFF_REQUEST_EVENT, (request) => {
		observed = request;
		request.handled = true;
	});
	const request = emitPierreDiffRequest(events, {
		baseline: "tool",
		path: "/tmp/demo.txt",
		toolCallId: "call-1",
		before: "before\n",
		after: "after\n",
	});
	assert.equal(request.handled, true);
	assert.equal(observed, request);
});

test("routes edit clicks only through explicit diff and reveal buttons", () => {
	const layout = planToolPathHeader(80, "edit ".length, "src/a.ts".length);
	assert.equal(toolPathClickTarget(layout.pathStart, layout), "path");
	assert.equal(toolPathClickTarget(layout.pathEnd - 1, layout), "path");
	assert.equal(toolPathClickTarget(layout.diffStart, layout), "diff");
	assert.equal(toolPathClickTarget(layout.diffEnd - 1, layout), "diff");
	assert.equal(toolPathClickTarget(layout.revealStart, layout), "reveal");
	assert.equal(toolPathClickAction({ toolName: "edit", target: "path", ctrl: false, shift: false }), "none");
	assert.equal(toolPathClickAction({ toolName: "edit", target: "path", ctrl: true, shift: false }), "none");
	assert.equal(toolPathClickAction({ toolName: "edit", target: "path", ctrl: false, shift: true }), "none");
	assert.equal(toolPathClickAction({ toolName: "edit", target: "diff", ctrl: false, shift: false }), "diff");
	assert.equal(toolPathClickAction({ toolName: "write", target: "path", ctrl: false, shift: false }), "terminal");
	assert.equal(toolPathClickAction({ toolName: "edit", target: "reveal", ctrl: false, shift: false }), "reveal");
});

test("narrow headers keep explicit diff and reveal buttons on one line", () => {
	assert.equal(clampToolPathWidth(64, 50), 50);
	assert.equal(clampToolPathWidth(40, 50), 40);
	const layout = planToolPathHeader(20, "edit ".length, 80);
	assert.equal(layout.titleWidth, 2);
	assert.equal(layout.pathWidth, 1);
	assert.equal(layout.diffWidth, 6);
	assert.equal(layout.revealWidth, 8);
	assert.equal(layout.revealEnd, 20);
	assert.equal(toolPathClickTarget(layout.pathStart, layout), "path");
	assert.equal(toolPathClickTarget(layout.diffStart + 1, layout), "diff");
	assert.equal(toolPathClickTarget(layout.revealStart + 1, layout), "reveal");
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
