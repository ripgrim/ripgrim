import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatFooterContext } from "./core.ts";

const STATUS_KEY = "footer-context";

export default function footerContext(pi: ExtensionAPI): void {
	const refresh = (ctx: ExtensionContext) => {
		const value = formatFooterContext(ctx.getContextUsage());
		ctx.ui.setStatus(
			STATUS_KEY,
			value ? ctx.ui.theme.fg("muted", value) : undefined,
		);
	};

	for (const event of [
		"session_start",
		"message_end",
		"turn_end",
		"model_select",
		"session_compact",
	] as const) {
		pi.on(event, (_event, ctx) => refresh(ctx));
	}

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});
}
