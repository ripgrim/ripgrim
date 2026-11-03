import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
	estimatedTokensFromCharacters,
	formatTokensPerSecond,
	tokensPerSecond,
} from "./core.ts";

const STATUS_KEY = "tok-s";
const LIVE_REFRESH_MS = 500;

function isAssistant(message: unknown): message is AssistantMessage {
	return typeof message === "object" && message !== null &&
		(message as { role?: unknown }).role === "assistant";
}

export default function tokenThroughput(pi: ExtensionAPI): void {
	let firstDeltaAt: number | undefined;
	let streamedCharacters = 0;
	let lastRefreshAt = 0;
	let lastFinal: string | undefined;

	const resetStream = (ctx: ExtensionContext) => {
		firstDeltaAt = undefined;
		streamedCharacters = 0;
		lastRefreshAt = 0;
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("muted", "… tok/s"));
	};

	pi.on("session_start", (_event, ctx) => {
		firstDeltaAt = undefined;
		streamedCharacters = 0;
		lastRefreshAt = 0;
		lastFinal = undefined;
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.on("message_start", (event, ctx) => {
		if (isAssistant(event.message)) resetStream(ctx);
	});

	pi.on("message_update", (event, ctx) => {
		const update = event.assistantMessageEvent;
		if (update.type === "start") {
			resetStream(ctx);
			return;
		}

		let deltaLength = 0;
		if (update.type === "text_delta" || update.type === "thinking_delta" || update.type === "toolcall_delta") {
			deltaLength = update.delta.length;
		}
		if (deltaLength === 0) return;

		const now = Date.now();
		firstDeltaAt ??= now;
		streamedCharacters += deltaLength;
		if (now - lastRefreshAt < LIVE_REFRESH_MS) return;
		lastRefreshAt = now;

		const rate = tokensPerSecond(
			estimatedTokensFromCharacters(streamedCharacters),
			now - firstDeltaAt,
		);
		if (rate !== undefined) {
			ctx.ui.setStatus(
				STATUS_KEY,
				ctx.ui.theme.fg("muted", formatTokensPerSecond(rate, true)),
			);
		}
	});

	pi.on("message_end", (event, ctx) => {
		if (!isAssistant(event.message)) return;
		const message = event.message;
		if (message.stopReason === "error" || message.stopReason === "aborted") {
			ctx.ui.setStatus(
				STATUS_KEY,
				lastFinal ? ctx.ui.theme.fg("accent", lastFinal) : undefined,
			);
			return;
		}

		const elapsedMs = firstDeltaAt === undefined
			? message.durationMs
			: Date.now() - firstDeltaAt;
		const rate = elapsedMs === undefined
			? undefined
			: tokensPerSecond(message.usage.output, elapsedMs);
		if (rate === undefined) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}

		lastFinal = formatTokensPerSecond(rate);
		ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("accent", lastFinal));
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
