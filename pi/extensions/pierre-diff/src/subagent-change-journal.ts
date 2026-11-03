import { appendFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readTextFile } from "../../../runtime/src/pierre-diff-core.ts";

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
		if (seen.has(absolutePath)) return;
		seen.add(absolutePath);
		const record = {
			v: 1,
			type: "snapshot",
			ts: Date.now(),
			actor,
			runId,
			cwd: ctx.cwd,
			path: absolutePath,
			displayPath,
			before: readTextFile(absolutePath),
		};
		try {
			appendFileSync(logPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
		} catch {
			// Change tracking must never fail a child tool call.
		}
	});

	pi.on("tool_execution_end", (event) => {
		const target = pending.get(event.toolCallId);
		if (!target) return;
		pending.delete(event.toolCallId);
		if (event.isError) return;
		try {
			appendFileSync(logPath, `${JSON.stringify({
				v: 1,
				type: "after",
				ts: Date.now(),
				actor,
				runId,
				cwd: target.cwd,
				path: target.absolutePath,
				displayPath: target.displayPath,
				after: readTextFile(target.absolutePath),
			})}\n`, { encoding: "utf8", mode: 0o600 });
		} catch {
			// Best effort only.
		}
	});
}
