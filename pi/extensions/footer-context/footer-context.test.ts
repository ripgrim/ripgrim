import assert from "node:assert/strict";
import test from "node:test";
import { compactTokenCount, formatFooterContext } from "./src/core.ts";

test("formats context percentage against the total model window", () => {
	assert.equal(formatFooterContext({ percent: 36.2, contextWindow: 272_000 }), "36%/272k");
	assert.equal(formatFooterContext({ percent: null, contextWindow: 200_000 }), "?/200k");
	assert.equal(formatFooterContext(undefined), undefined);
});

test("formats token windows compactly", () => {
	assert.equal(compactTokenCount(999), "999");
	assert.equal(compactTokenCount(128_000), "128k");
	assert.equal(compactTokenCount(1_500_000), "1.5m");
});
