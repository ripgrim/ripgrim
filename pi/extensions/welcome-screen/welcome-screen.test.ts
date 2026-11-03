import assert from "node:assert/strict";
import test from "node:test";
import {
	compactWhitespace,
	formatRelativeTime,
	projectName,
	selectRecentSessions,
} from "./src/core.ts";

test("selectRecentSessions excludes the current and empty sessions, sorts, and labels", () => {
	const recent = selectRecentSessions([
		{
			path: "/sessions/current.jsonl",
			cwd: "/home/test/current",
			name: "Current",
			modified: new Date("2026-01-04T00:00:00Z"),
			messageCount: 4,
			firstMessage: "current",
		},
		{
			path: "/sessions/older.jsonl",
			cwd: "/home/test/code/older",
			modified: new Date("2026-01-02T00:00:00Z"),
			messageCount: 2,
			firstMessage: "  Fix\n  the login flow  ",
		},
		{
			path: "/sessions/newer.jsonl",
			cwd: "/home/test/code/newer",
			name: "Release prep",
			modified: new Date("2026-01-03T00:00:00Z"),
			messageCount: 3,
			firstMessage: "ignored when named",
		},
		{
			path: "/sessions/empty.jsonl",
			cwd: "/home/test/code/empty",
			modified: new Date("2026-01-05T00:00:00Z"),
			messageCount: 0,
			firstMessage: "",
		},
	], "/sessions/current.jsonl", 3);

	assert.deepEqual(recent.map(({ label, project }) => ({ label, project })), [
		{ label: "Release prep", project: "newer" },
		{ label: "Fix the login flow", project: "older" },
	]);
});

test("formatRelativeTime uses compact readable units", () => {
	const now = new Date("2026-01-08T12:00:00Z").getTime();
	assert.equal(formatRelativeTime(new Date(now - 20_000), now), "now");
	assert.equal(formatRelativeTime(new Date(now - 5 * 60_000), now), "5m ago");
	assert.equal(formatRelativeTime(new Date(now - 3 * 3_600_000), now), "3h ago");
	assert.equal(formatRelativeTime(new Date(now - 2 * 86_400_000), now), "2d ago");
	assert.equal(formatRelativeTime(new Date(now - 14 * 86_400_000), now), "2w ago");
});

test("path and text helpers handle common session metadata", () => {
	assert.equal(projectName("~/code/ripgrim/pi/"), "pi");
	assert.equal(projectName("C:\\work\\demo"), "demo");
	assert.equal(compactWhitespace(" one\n\t two "), "one two");
});
