import { appendFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readTextFile } from "../../../runtime/src/pierre-diff-core.ts";
import { toolResultPatch } from "../../../runtime/src/tool-diff-snapshots.ts";

/**
 * Headless child-side change journal.
 * Loaded explicitly by the local pi-subagents fork when a parent Pierre tracker
 * publishes PI_PIERRE_CHANGE_LOG. It has no tools, commands, or UI.
 */
export default function subagentChangeJournal(pi: ExtensionAPI): void {
	const logPath = process.env.PI_PIERRE_CHANGE_LOG?.trim();
	const actorIdentity = process.env.PI_PIERRE_ACTOR?.trim();
	if (!logPath || !actorIdentity) return;
	const actor = actorIdentity;
	const runId = process.env.PI_PIERRE_RUN_ID?.trim() || `pid-${process.pid}`;
	const seen = new Set<string>();
	const pending = new Map<string, { absolutePath: string; displayPath: string; cwd: string }>();

	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const requested = typeof event.args?.path === "string" ? event.args.path : undefined;
		if (!requested) return;
		const absolutePath = isAbsolute(requested) ? requested : resolve(ctx.cwd, requested);
		const displayPath = relative(ctx.cwd, absolutePath) || requested;
		pending.set(event.toolCallId, { absolutePath, displayPath, cwd: ctx.cwd });
		const before = readTextFile(absolutePath);
		const records = [{
			v: 1,
			type: "tool_snapshot",
			toolCallId: event.toolCallId,
			ts: Date.now(),
			actor,
			runId,
			cwd: ctx.cwd,
			path: absolutePath,
			displayPath,
			before,
		}];
		if (!seen.has(absolutePath)) {
			seen.add(absolutePath);
			records.push({
				v: 1,
				type: "snapshot",
				toolCallId: event.toolCallId,
				ts: Date.now(),
				actor,
				runId,
				cwd: ctx.cwd,
				path: absolutePath,
				displayPath,
				before,
			});
		}
		try {
			appendFileSync(logPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
		} catch {
			// Change tracking must never fail a child tool call.
		}
	});

	pi.on("tool_execution_end", (event) => {
		const target = pending.get(event.toolCallId);
		if (!target) return;
		pending.delete(event.toolCallId);
		const after = event.isError ? null : readTextFile(target.absolutePath);
		const patch = event.toolName === "edit" ? toolResultPatch(event.result) : undefined;
		const records = [{
			v: 1,
			type: "tool_after",
			toolCallId: event.toolCallId,
			ts: Date.now(),
			actor,
			runId,
			cwd: target.cwd,
			path: target.absolutePath,
			displayPath: target.displayPath,
			after,
			patch,
			failed: event.isError,
			unavailable: !event.isError && event.toolName === "edit" && patch === undefined,
		}];
		if (!event.isError) records.push({
			v: 1,
			type: "after",
			toolCallId: event.toolCallId,
			ts: Date.now(),
			actor,
			runId,
			cwd: target.cwd,
			path: target.absolutePath,
			displayPath: target.displayPath,
			after,
			patch,
			failed: false,
			unavailable: false,
		});
		try {
			appendFileSync(logPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
		} catch {
			// Best effort only.
		}
	});
}
