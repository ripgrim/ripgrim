import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import {
	getCapabilities,
	hyperlink,
	MouseRegion,
	Text,
	truncateToWidth,
	type KeybindingsManager,
} from "@earendil-works/pi-tui";
import {
	absoluteToolPath,
	buildOpenCommand,
	desktopFileUrl,
	detectDesktopPlatform,
	isClipboardImagePath,
} from "./core.ts";

const FEEDBACK_WIDGET_ID = "grim-attachment-paste";
const PASTE_TIMEOUT_MS = 10_000;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

interface PasteInternals {
	pastes: Map<number, string>;
	pasteCounter: number;
}

interface ImageChip {
	marker: string;
	label: string;
}

function decorateAttachmentEditor(
	editor: CustomEditor,
	keybindings: KeybindingsManager,
	appTheme: Theme,
	onPasteStart: () => void,
	onPasteFinish: () => void,
): CustomEditor {
	let imageCounter = 0;
	const imageChips = new Map<number, ImageChip>();
	const baseHandleInput = editor.handleInput.bind(editor);
	const baseInsertTextAtCursor = editor.insertTextAtCursor.bind(editor);
	const baseRender = editor.render.bind(editor);

	editor.handleInput = (data: string): void => {
		const pasteRunsNormally =
			keybindings.matches(data, "app.clipboard.pasteImage") &&
			!(editor.isShowingAutocomplete() &&
				(keybindings.matches(data, "tui.select.pageUp") ||
					keybindings.matches(data, "tui.select.pageDown")));
		if (pasteRunsNormally) onPasteStart();
		baseHandleInput(data);
	};

	editor.insertTextAtCursor = (text: string): void => {
		onPasteFinish();
		if (!isClipboardImagePath(text)) {
			baseInsertTextAtCursor(text);
			return;
		}

		const internals = editor as unknown as PasteInternals;
		if (editor.getText().length === 0 && internals.pasteCounter === 0) {
			imageCounter = 0;
			imageChips.clear();
		}

		internals.pasteCounter += 1;
		imageCounter += 1;
		const pasteId = internals.pasteCounter;
		const marker = `[paste #${pasteId} ${text.length} chars]`;
		const label = `[Pasted image #${imageCounter}]`;
		internals.pastes.set(pasteId, text);
		imageChips.set(pasteId, { marker, label });
		baseInsertTextAtCursor(marker);
	};

	editor.render = (width: number): string[] => {
		const lines = baseRender(width);
		if (imageChips.size === 0) return lines;
		return lines.map((line) => {
			let rendered = line;
			for (const chip of imageChips.values()) {
				if (!rendered.includes(chip.marker)) continue;
				const padding = " ".repeat(Math.max(0, chip.marker.length - chip.label.length));
				const styled = appTheme.style(chip.label, {
					fg: "accent",
					bg: "selectedBg",
					bold: true,
				});
				rendered = rendered.replaceAll(chip.marker, `${styled}${padding}`);
			}
			return rendered;
		});
	};

	return editor;
}

function createPasteFeedback(ctx: ExtensionContext): {
	start(): void;
	finish(): void;
	dispose(): void;
} {
	let frame = 0;
	let animation: ReturnType<typeof setInterval> | undefined;
	let timeout: ReturnType<typeof setTimeout> | undefined;

	const clearTimers = () => {
		if (animation) clearInterval(animation);
		if (timeout) clearTimeout(timeout);
		animation = undefined;
		timeout = undefined;
	};

	const finish = () => {
		clearTimers();
		ctx.ui.setWidget(FEEDBACK_WIDGET_ID, undefined);
	};

	const start = () => {
		finish();
		ctx.ui.setWidget(
			FEEDBACK_WIDGET_ID,
			(tui, theme) => ({
				render(width: number): string[] {
					const spinner = theme.fg("accent", SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!);
					return [truncateToWidth(` ${spinner} ${theme.fg("muted", "Pasting from clipboard…")}`, width)];
				},
				invalidate() {},
			}),
			{ placement: "belowEditor" },
		);
		animation = setInterval(() => {
			frame += 1;
			ctx.ui.setWidget(
				FEEDBACK_WIDGET_ID,
				(tui, theme) => new Text(
					`${theme.fg("accent", SPINNER_FRAMES[frame % SPINNER_FRAMES.length]!)} ${theme.fg("muted", "Pasting from clipboard…")}`,
					1,
					0,
				),
				{ placement: "belowEditor" },
			);
		}, 80);
		timeout = setTimeout(finish, PASTE_TIMEOUT_MS);
	};

	return { start, finish, dispose: finish };
}

async function toWindowsPath(pi: ExtensionAPI, path: string): Promise<string> {
	const result = await pi.exec("wslpath", ["-w", path], { timeout: 3000 });
	return result.code === 0 && result.stdout.trim() ? result.stdout.trim() : path;
}

export default function attachmentUx(pi: ExtensionAPI): void {
	let activeContext: ExtensionContext | undefined;
	let disposeFeedback: (() => void) | undefined;

	const openPath = async (path: string, reveal: boolean, cwd: string): Promise<void> => {
		const ctx = activeContext;
		if (!ctx) return;
		const absolutePath = absoluteToolPath(path, cwd);
		const platform = detectDesktopPlatform();
		const windowsPath = platform === "wsl" ? await toWindowsPath(pi, absolutePath) : absolutePath;
		const command = buildOpenCommand(platform, absolutePath, reveal, windowsPath);
		const result = await pi.exec(command.command, command.args, { timeout: 5000 });
		if (result.code !== 0) {
			ctx.ui.notify(
				`Could not ${reveal ? "reveal" : "open"} ${absolutePath}: ${result.stderr.trim() || `exit ${result.code}`}`,
				"error",
			);
		}
	};

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		activeContext = ctx;
		const feedback = createPasteFeedback(ctx);
		disposeFeedback = feedback.dispose;
		const previousEditorFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, editorTheme, keybindings) => {
			const editor = previousEditorFactory?.(tui, editorTheme, keybindings)
				?? new CustomEditor(tui, editorTheme, keybindings);
			return decorateAttachmentEditor(
				editor,
				keybindings,
				ctx.ui.theme,
				feedback.start,
				feedback.finish,
			);
		});
	});

	pi.on("session_shutdown", () => {
		disposeFeedback?.();
		disposeFeedback = undefined;
		activeContext = undefined;
	});

	pi.registerToolRenderer((toolName, next) => {
		const existing = next();
		return {
			...existing,
			renderCall(args: Record<string, unknown>, theme, context) {
				const rawPath = typeof args.path === "string" ? args.path : undefined;
				if (!rawPath) {
					return existing?.renderCall?.(args, theme, { ...context, lastComponent: undefined })
						?? new Text(theme.fg("toolTitle", toolName), 0, 0);
				}

				const absolutePath = absoluteToolPath(rawPath, context.cwd);
				const platform = detectDesktopPlatform();
				const fileUrl = desktopFileUrl(platform, absolutePath, false);
				const revealUrl = desktopFileUrl(platform, absolutePath, true);
				const linkedPath = getCapabilities().hyperlinks
					? hyperlink(theme.underline(theme.fg("accent", rawPath)), fileUrl)
					: theme.underline(theme.fg("accent", rawPath));
				const revealLink = getCapabilities().hyperlinks
					? hyperlink(theme.fg("muted", "[reveal]"), revealUrl)
					: theme.fg("muted", "[reveal]");
				const child = new Text(
					`${theme.fg("toolTitle", theme.bold(`${toolName} `))}${linkedPath}  ${revealLink}`,
					0,
					0,
				);

				return new MouseRegion(child, (event) => {
					if (event.type !== "click" || event.button !== "left") return;
					if (!event.ctrl && !event.shift) return;
					void openPath(rawPath, event.shift, context.cwd);
					return { handled: true, render: false };
				});
			},
		};
	});
}
