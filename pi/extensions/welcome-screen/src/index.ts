import {
	SessionManager,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	formatRelativeTime,
	selectRecentSessions,
	type WelcomeRecentSession,
} from "./core.ts";

const WIDGET_ID = "grim-welcome-screen";
const DISMISS_AFTER_SECONDS = 5;
const MAX_RECENT_SESSIONS = 3;

interface WelcomeData {
	model: string;
	provider: string;
	thinking: string;
	cwd: string;
	recent: WelcomeRecentSession[];
}

interface RenderableWelcome {
	render(width: number): string[];
	invalidate(): void;
	setSeconds(seconds: number): void;
}

function padAnsi(value: string, width: number): string {
	const clipped = truncateToWidth(value, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function shortenHome(path: string): string {
	const home = process.env.HOME;
	return home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;
}

function createWelcomeComponent(theme: Theme, data: WelcomeData): RenderableWelcome {
	let seconds = DISMISS_AFTER_SECONDS;
	let cacheWidth: number | undefined;
	let cache: string[] | undefined;

	const accent = (text: string) => theme.fg("accent", text);
	const muted = (text: string) => theme.fg("muted", text);
	const dim = (text: string) => theme.fg("dim", text);
	const success = (text: string) => theme.fg("success", text);

	const logo = [
		accent("███╗   ██╗"),
		accent("████╗  ██║"),
		accent("██╔██╗ ██║"),
		accent("██║╚██╗██║"),
		accent("██║ ╚████║"),
		accent("╚═╝  ╚═══╝"),
	];

	const recentLines = data.recent.length > 0
		? data.recent.map((session) => {
			const age = formatRelativeTime(session.modified);
			return `${success("•")} ${accent(session.project)} ${muted(`— ${session.label}`)} ${dim(`(${age})`)}`;
		})
		: [dim("No previous sessions yet")];

	const render = (width: number): string[] => {
		if (cache && cacheWidth === width) return cache;
		cacheWidth = width;

		if (width < 34) {
			cache = [
				theme.bold("Welcome back!"),
				muted(`${data.provider}/${data.model}`),
				...recentLines.map((line) => truncateToWidth(line, width)),
				dim(`Press any key (${seconds}s)`),
			];
			return cache;
		}

		const outerWidth = Math.min(width, 82);
		const innerWidth = outerWidth - 2;
		const border = (text: string) => accent(text);
		const contentLine = (content = "") => `${border("│")}${padAnsi(` ${content}`, innerWidth)}${border("│")}`;
		const title = " pi agent ";
		const footer = ` Press any key to continue (${seconds}s) `;
		const top = `${border("┌")}${accent(title)}${border("─".repeat(Math.max(0, innerWidth - title.length)))}${border("┐")}`;
		const bottomFill = Math.max(0, innerWidth - footer.length);
		const bottom = `${border("└")}${border("─".repeat(Math.floor(bottomFill / 2)))}${dim(footer)}${border("─".repeat(Math.ceil(bottomFill / 2)))}${border("┘")}`;

		if (outerWidth < 62) {
			cache = [
				top,
				contentLine(theme.bold("Welcome back!")),
				contentLine(`${muted("Model")}  ${accent(data.model)}`),
				contentLine(`${muted("From")}   ${accent(data.provider)}`),
				contentLine(`${muted("Think")}  ${accent(data.thinking)}`),
				contentLine(`${muted("Cwd")}    ${dim(shortenHome(data.cwd))}`),
				contentLine(),
				contentLine(theme.bold("Recent sessions")),
				...recentLines.map((line) => contentLine(line)),
				contentLine(),
				contentLine(`${accent("/")} commands  ${accent("!")} shell  ${accent("/resume")} sessions`),
				bottom,
			];
			return cache;
		}

		const leftWidth = 23;
		const dividerWidth = 3;
		const rightWidth = innerWidth - 1 - leftWidth - dividerWidth;
		const rows = Math.max(10, recentLines.length + 7);
		const left = [
			theme.bold("Welcome back!"),
			...logo,
			`${accent(data.model)} ${dim(`(${data.provider})`)}`,
			muted(`think:${data.thinking}`),
		];
		const right = [
			theme.bold("Tips"),
			`${accent("/")} for commands`,
			`${accent("!")} to run shell commands`,
			`${accent("Shift+Tab")} cycle thinking`,
			"",
			theme.bold("Recent sessions"),
			...recentLines,
			"",
			`${muted("cwd")} ${dim(shortenHome(data.cwd))}`,
		];
		const body = Array.from({ length: rows }, (_, index) => {
			const leftCell = padAnsi(left[index] ?? "", leftWidth);
			const rightCell = padAnsi(right[index] ?? "", rightWidth);
			return contentLine(`${leftCell}${dim(" │ ")}${rightCell}`);
		});
		cache = [top, ...body, bottom];
		return cache;
	};

	return {
		render,
		invalidate() {
			cacheWidth = undefined;
			cache = undefined;
		},
		setSeconds(nextSeconds: number) {
			seconds = nextSeconds;
			this.invalidate();
		},
	};
}

export default function welcomeScreen(pi: ExtensionAPI): void {
	let dismissCurrent: (() => void) | undefined;

	const show = async (ctx: ExtensionContext): Promise<void> => {
		if (ctx.mode !== "tui") return;
		dismissCurrent?.();

		let recent: WelcomeRecentSession[] = [];
		try {
			const sessions = await SessionManager.listAll();
			recent = selectRecentSessions(
				sessions,
				ctx.sessionManager.getSessionFile(),
				MAX_RECENT_SESSIONS,
			);
		} catch {
			// The welcome screen should never block Pi startup if session discovery fails.
		}

		const welcomeData: WelcomeData = {
			model: ctx.model?.name ?? ctx.model?.id ?? "No model",
			provider: ctx.model?.provider ?? "unconfigured",
			thinking: ctx.thinkingLevel,
			cwd: ctx.cwd,
			recent,
		};

		let seconds = DISMISS_AFTER_SECONDS;
		let dismissed = false;
		let unsubscribe: (() => void) | undefined;
		let timer: ReturnType<typeof setInterval> | undefined;
		const dismiss = () => {
			if (dismissed) return;
			dismissed = true;
			if (timer) clearInterval(timer);
			unsubscribe?.();
			ctx.ui.setWidget(WIDGET_ID, undefined);
			if (dismissCurrent === dismiss) dismissCurrent = undefined;
		};
		dismissCurrent = dismiss;

		ctx.ui.setWidget(WIDGET_ID, (tui, theme) => {
			const component = createWelcomeComponent(theme, welcomeData);
			timer = setInterval(() => {
				seconds -= 1;
				if (seconds <= 0) {
					dismiss();
					return;
				}
				component.setSeconds(seconds);
				tui.requestRender();
			}, 1000);
			return component;
		});

		const armedAt = Date.now() + 150;
		unsubscribe = ctx.ui.onTerminalInput((data) => {
			if (Date.now() < armedAt || !data) return;
			dismiss();
			return { consume: true };
		});
	};

	pi.on("session_start", async (event, ctx) => {
		const hasConversation = ctx.sessionManager.getEntries().some((entry) =>
			entry.type === "message" && (entry.message.role === "user" || entry.message.role === "assistant")
		);
		if ((event.reason === "startup" || event.reason === "new") && !hasConversation) await show(ctx);
	});

	pi.on("session_shutdown", () => dismissCurrent?.());
	pi.on("before_agent_start", () => dismissCurrent?.());

	pi.registerCommand("welcome", {
		description: "Show the welcome screen and recent sessions",
		handler: async (_args, ctx) => show(ctx),
	});

}
