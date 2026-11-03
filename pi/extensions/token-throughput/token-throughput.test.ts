import assert from "node:assert/strict";
import test from "node:test";
import tokenThroughputExtension from "./src/index.ts";
import {
	estimatedTokensFromCharacters,
	formatTokensPerSecond,
	tokensPerSecond,
} from "./src/core.ts";

test("calculates output tokens per streaming second", () => {
	assert.equal(tokensPerSecond(120, 2000), 60);
	assert.equal(tokensPerSecond(0, 1000), undefined);
	assert.equal(tokensPerSecond(100, 0), undefined);
});

test("estimates live token counts from streamed characters", () => {
	assert.equal(estimatedTokensFromCharacters(400), 100);
	assert.equal(estimatedTokensFromCharacters(-1), 0);
});

test("formats final and estimated throughput", () => {
	assert.equal(formatTokensPerSecond(87.43), "87 tok/s");
	assert.equal(formatTokensPerSecond(7.25), "7.3 tok/s");
	assert.equal(formatTokensPerSecond(87.43, true), "~87 tok/s");
	assert.equal(formatTokensPerSecond(Number.NaN), "— tok/s");
});

test("publishes a final tok/s status from streamed assistant output", async () => {
	const handlers = new Map<string, (event: any, ctx: any) => unknown>();
	const statuses = new Map<string, string | undefined>();
	const pi = {
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			handlers.set(name, handler);
		},
	};
	const ctx = {
		ui: {
			setStatus(key: string, value: string | undefined) {
				statuses.set(key, value);
			},
			theme: { fg: (_color: string, value: string) => value },
		},
	};

	tokenThroughputExtension(pi as any);
	const originalNow = Date.now;
	let now = 1_000;
	Date.now = () => now;
	try {
		await handlers.get("message_update")?.({
			assistantMessageEvent: { type: "text_delta", delta: "hello" },
		}, ctx);
		now = 3_000;
		await handlers.get("message_end")?.({
			message: {
				role: "assistant",
				stopReason: "stop",
				usage: { output: 120 },
			},
		}, ctx);
	} finally {
		Date.now = originalNow;
	}

	assert.equal(statuses.get("tok-s"), "60 tok/s");
});
