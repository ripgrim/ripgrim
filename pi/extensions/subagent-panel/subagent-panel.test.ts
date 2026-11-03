import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	appendInspectorOutput,
	cleanInspectorLines,
	findTranscriptRow,
	inspectorArgvForTarget,
	latestInspectorFrame,
	planDrawerLayout,
	renderByRevision,
	transcriptLineForViewport,
} from "./src/core.ts";
import { createJsonlTailState, readJsonlTail } from "../../runtime/src/incremental-jsonl.ts";

test("keeps only the latest inspector screen", () => {
	const output = "old\n\x1b[2J\x1b[Hnew frame\n> ";
	assert.equal(latestInspectorFrame(output), "new frame\n> ");
});

test("removes runner chrome while preserving transcript detail", () => {
	assert.deepEqual(cleanInspectorLines([
		"pi-subagents inspector for abc",
		"This inspector mirrors lifecycle artifacts; closing it does not stop the run.",
		"",
		"worker · running",
		"hello from child",
		"Controls: type guidance | stop | status",
		"Supervisor replies remain in the parent Pi session (subagent_supervisor/intercom); this inspector is read-only.",
		"> ",
	].join("\n")), ["worker · running", "hello from child"]);
});

test("hides artifact paths and verbose lifecycle metadata from the drawer", () => {
	assert.deepEqual(cleanInspectorLines([
		"Mission: hidden (active)",
		"Mission id: abc",
		"Run: full-uuid",
		"State: running",
		"Mode: single [fresh]",
		"Step: 0 (worker: long task) | running | 2.5k tok",
		"wrapped step metadata",
		"Artifacts:",
		"  Output:",
		"/tmp/run/output-0.log",
		"Transcript tail from /tmp/run/output-0.log:",
		"  Task: inspect the drawer",
		"  bash: sleep 90",
	].join("\n")), ["State: running", "Task: inspect the drawer", "bash: sleep 90"]);
});

test("retargets the standalone inspector across workflow child runs", () => {
	assert.deepEqual(
		inspectorArgvForTarget(
			["runner.mjs", "--async-dir", "/tmp/old", "--run-id", "old", "--index", "0"],
			{ asyncDir: "/tmp/new", runId: "new", index: 2 },
		),
		["runner.mjs", "--async-dir", "/tmp/new", "--run-id", "new", "--index", "2"],
	);
});

test("bounds streaming output at the latest clear-screen frame", () => {
	const previous = "stale";
	const next = appendInspectorOutput(previous, "\x1b[2J\x1b[Hfresh");
	assert.equal(next, "\x1b[2J\x1b[Hfresh");
	assert.equal(appendInspectorOutput("12345", "67890", 6), "567890");
});

test("incrementally tails complete JSONL records without losing partial or malformed lines", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-jsonl-tail-"));
	const path = join(root, "events.jsonl");
	try {
		writeFileSync(path, `${JSON.stringify({ id: 1, text: "Ω" })}\n{broken}\n{"id":2`);
		const state = createJsonlTailState();
		const first = readJsonlTail<{ id: number; text?: string }>(path, state, { chunkBytes: 3 });
		assert.deepEqual(first.records, [{ id: 1, text: "Ω" }]);
		assert.equal(first.malformedLines, 1);
		appendFileSync(path, `}\n${JSON.stringify({ id: 3 })}\n`);
		const second = readJsonlTail<{ id: number }>(path, state, { chunkBytes: 2 });
		assert.deepEqual(second.records, [{ id: 2 }, { id: 3 }]);
		assert.equal(readJsonlTail(path, state).records.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("JSONL lookbehind owns bounded storage instead of retaining the read chunk", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-jsonl-lookbehind-"));
	const path = join(root, "events.jsonl");
	try {
		writeFileSync(path, `${"x".repeat(256 * 1024)}\n`);
		const state = createJsonlTailState();
		readJsonlTail(path, state, { chunkBytes: 256 * 1024, maxLineBytes: 512 * 1024, lookbehindBytes: 64 });
		assert.equal(state.lookbehind.length, 64);
		assert.equal(state.lookbehind.buffer.byteLength, 64);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("JSONL tail detects same-inode truncate-and-regrow past a partial cursor", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-jsonl-regrow-"));
	const path = join(root, "events.jsonl");
	try {
		writeFileSync(path, '{"old":');
		const state = createJsonlTailState();
		const partial = readJsonlTail(path, state);
		assert.deepEqual(partial.records, []);
		assert.equal(state.offset, 7);
		assert.equal(state.carry.length, 7);
		truncateSync(path, 0);
		appendFileSync(path, '{"id":9}\n');
		const regrown = readJsonlTail<{ id: number }>(path, state);
		assert.equal(regrown.reset, true);
		assert.equal(regrown.malformedLines, 0);
		assert.deepEqual(regrown.records, [{ id: 9 }]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("JSONL tail resets after truncation and enforces its scan budget", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-jsonl-reset-"));
	const path = join(root, "events.jsonl");
	try {
		writeFileSync(path, `${JSON.stringify({ id: 1 })}\n${JSON.stringify({ id: 2 })}\n`);
		const state = createJsonlTailState();
		const first = readJsonlTail<{ id: number }>(path, state, { maxBytes: 9, chunkBytes: 4 });
		assert.equal(first.hasMore, true);
		const resumed = readJsonlTail<{ id: number }>(path, state);
		assert.deepEqual([...first.records, ...resumed.records], [{ id: 1 }, { id: 2 }]);
		truncateSync(path, 0);
		appendFileSync(path, `${JSON.stringify({ id: 9 })}\n`);
		const reset = readJsonlTail<{ id: number }>(path, state);
		assert.equal(reset.reset, true);
		assert.deepEqual(reset.records, [{ id: 9 }]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("transcript render cache is keyed by revision and width", () => {
	let renders = 0;
	let result = renderByRevision(undefined, 1, 40, () => ++renders);
	assert.equal(result.reused, false);
	result = renderByRevision(result.cache, 1, 40, () => ++renders);
	assert.equal(result.reused, true);
	assert.equal(renders, 1);
	result = renderByRevision(result.cache, 2, 40, () => ++renders);
	assert.equal(result.reused, false);
	result = renderByRevision(result.cache, 2, 20, () => ++renders);
	assert.equal(result.reused, false);
	assert.equal(renders, 3);
});

test("mouse row lookup accounts for scroll position and blank top padding", () => {
	const rows = [
		{ id: "first", transcriptStart: 0, height: 2 },
		{ id: "tool", transcriptStart: 2, height: 4 },
	];
	assert.equal(transcriptLineForViewport(0, 1, 2), undefined);
	const line = transcriptLineForViewport(2, 1, 2);
	assert.equal(line, 3);
	assert.equal(findTranscriptRow(rows, line!)?.id, "tool");
	assert.equal(findTranscriptRow(rows, 9), undefined);
});

test("drawer layout never exceeds hostile terminal dimensions", () => {
	for (const width of [1, 8, 20, 44, 80]) {
		for (const height of [1, 4, 8, 12, 30]) {
			const plan = planDrawerLayout(width, height, true);
			assert.ok(plan.width <= width);
			assert.ok(plan.height <= height);
			assert.ok(plan.viewportHeight <= plan.height);
			if (plan.bordered) assert.ok(plan.viewportHeight >= 1);
		}
	}
});
