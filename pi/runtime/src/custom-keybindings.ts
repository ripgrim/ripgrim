import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KeyId } from "@earendil-works/pi-tui";

export const CUSTOM_KEYBINDING_EVENT = "grim:keybindings:v1";
export const CUSTOM_KEYBINDINGS_PATH = join(getAgentDir(), "grim-keybindings.json");

export interface CustomKeybindingDescriptor {
	id: string;
	label: string;
	description: string;
	defaultKey: KeyId;
	section: string;
}

export function readCustomBindings(): Record<string, string> {
	try {
		const parsed = JSON.parse(readFileSync(CUSTOM_KEYBINDINGS_PATH, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

export function customKey(id: string, fallback: KeyId): KeyId {
	const value = readCustomBindings()[id];
	return typeof value === "string" && value.trim() ? value.trim() as KeyId : fallback;
}

export function registerCustomKeybinding(pi: Pick<ExtensionAPI, "events">, descriptor: CustomKeybindingDescriptor): () => void {
	let disposed = false;
	const emit = (requestId?: string) => {
		if (!disposed) pi.events.emit(CUSTOM_KEYBINDING_EVENT, { type: "register", descriptor, ...(requestId ? { requestId } : {}) });
	};
	const off = pi.events.on(CUSTOM_KEYBINDING_EVENT, (event) => {
		if (!event || typeof event !== "object") return;
		const data = event as { type?: string; requestId?: string };
		if (data.type === "discover") emit(data.requestId);
	});
	emit();
	return () => {
		disposed = true;
		off();
		pi.events.emit(CUSTOM_KEYBINDING_EVENT, { type: "unregister", id: descriptor.id });
	};
}
