import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export interface JsonlTailState {
	offset: number;
	carry: Buffer;
	discardingLine: boolean;
	lookbehind: Buffer;
	fileIdentity?: string;
}

export interface JsonlTailOptions {
	maxBytes?: number;
	chunkBytes?: number;
	maxLineBytes?: number;
	lookbehindBytes?: number;
}

export interface JsonlTailResult<T = Record<string, unknown>> {
	records: T[];
	bytesRead: number;
	malformedLines: number;
	reset: boolean;
	hasMore: boolean;
}

export function createJsonlTailState(): JsonlTailState {
	return { offset: 0, carry: Buffer.alloc(0), discardingLine: false, lookbehind: Buffer.alloc(0) };
}

function resetState(state: JsonlTailState, identity: string): void {
	state.offset = 0;
	state.carry = Buffer.alloc(0);
	state.discardingLine = false;
	state.lookbehind = Buffer.alloc(0);
	state.fileIdentity = identity;
}

/**
 * Incrementally reads newline-terminated JSON records. The byte cursor advances
 * over bytes already retained in carry, so a partial final record is completed
 * exactly once by a later call. Complete malformed records are isolated.
 */
export function readJsonlTail<T = Record<string, unknown>>(
	path: string,
	state: JsonlTailState,
	options: JsonlTailOptions = {},
): JsonlTailResult<T> {
	const maxBytes = Math.max(1, options.maxBytes ?? 4 * 1024 * 1024);
	const chunkBytes = Math.max(1, Math.min(options.chunkBytes ?? 64 * 1024, maxBytes));
	const maxLineBytes = Math.max(1, options.maxLineBytes ?? 1024 * 1024);
	const lookbehindBytes = Math.max(1, options.lookbehindBytes ?? 64);
	const records: T[] = [];
	let malformedLines = 0;
	let bytesRead = 0;
	let reset = false;
	let fd: number;
	try {
		fd = openSync(path, "r");
	} catch {
		return { records, bytesRead, malformedLines, reset, hasMore: false };
	}
	try {
		let stat = fstatSync(fd);
		const identity = `${stat.dev}:${stat.ino}`;
		if ((state.fileIdentity !== undefined && state.fileIdentity !== identity) || stat.size < state.offset) {
			resetState(state, identity);
			reset = true;
		} else if (state.fileIdentity === undefined) {
			state.fileIdentity = identity;
		} else if (state.offset > 0 && state.lookbehind.length > 0) {
			const verifyLength = Math.min(state.lookbehind.length, state.offset);
			const actual = Buffer.allocUnsafe(verifyLength);
			const verified = readSync(fd, actual, 0, verifyLength, state.offset - verifyLength);
			const expected = state.lookbehind.subarray(state.lookbehind.length - verified);
			if (verified !== verifyLength || !actual.subarray(0, verified).equals(expected)) {
				resetState(state, identity);
				reset = true;
			}
		}

		while (state.offset < stat.size && bytesRead < maxBytes) {
			const count = Math.min(chunkBytes, maxBytes - bytesRead, stat.size - state.offset);
			const chunk = Buffer.allocUnsafe(count);
			const read = readSync(fd, chunk, 0, count, state.offset);
			if (read <= 0) break;
			state.offset += read;
			bytesRead += read;
			const readBytes = chunk.subarray(0, read);
			state.lookbehind = Buffer.concat([state.lookbehind, readBytes]).subarray(-lookbehindBytes);
			let data = readBytes;

			if (state.discardingLine) {
				const newline = data.indexOf(0x0a);
				if (newline < 0) continue;
				state.discardingLine = false;
				data = data.subarray(newline + 1);
			}
			if (state.carry.length) {
				data = Buffer.concat([state.carry, data]);
				state.carry = Buffer.alloc(0);
			}

			let start = 0;
			for (;;) {
				const newline = data.indexOf(0x0a, start);
				if (newline < 0) break;
				let line = data.subarray(start, newline);
				if (line.length && line[line.length - 1] === 0x0d) line = line.subarray(0, line.length - 1);
				start = newline + 1;
				if (!line.length) continue;
				if (line.length > maxLineBytes) {
					malformedLines++;
					continue;
				}
				try {
					records.push(JSON.parse(line.toString("utf8")) as T);
				} catch {
					malformedLines++;
				}
			}

			const remainder = data.subarray(start);
			if (remainder.length > maxLineBytes) {
				malformedLines++;
				state.discardingLine = true;
				state.carry = Buffer.alloc(0);
			} else if (remainder.length) {
				state.carry = Buffer.from(remainder);
			}
			stat = fstatSync(fd);
		}
		return { records, bytesRead, malformedLines, reset, hasMore: state.offset < stat.size };
	} finally {
		closeSync(fd);
	}
}
