import { dirname, resolve } from "node:path";

const IMAGE_EXTENSIONS = new Set([
	"bmp",
	"gif",
	"heic",
	"heif",
	"jpeg",
	"jpg",
	"png",
	"tif",
	"tiff",
	"webp",
]);

export type DesktopPlatform = "linux" | "macos" | "windows" | "wsl";

export interface OpenCommand {
	command: string;
	args: string[];
}

export function isClipboardImagePath(value: string): boolean {
	const path = value.trim();
	if (!/^[/\\]|^[A-Za-z]:[\\/]/.test(path) || /[\r\n]/.test(path)) return false;
	const filename = path.split(/[\\/]/).at(-1) ?? "";
	const extension = filename.includes(".") ? filename.split(".").at(-1)?.toLowerCase() : undefined;
	return filename.startsWith("pi-clipboard-") && extension !== undefined && IMAGE_EXTENSIONS.has(extension);
}

export function detectDesktopPlatform(
	platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): DesktopPlatform {
	if (platform === "darwin") return "macos";
	if (platform === "win32") return "windows";
	if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) return "wsl";
	return "linux";
}

export function absoluteToolPath(path: string, cwd: string): string {
	const normalized = path.startsWith("@") ? path.slice(1) : path;
	return resolve(cwd, normalized);
}

function encodePathSegments(path: string): string {
	return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function desktopFileUrl(
	platform: DesktopPlatform,
	path: string,
	reveal: boolean,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const target = reveal ? dirname(path) : path;
	if (platform === "wsl") {
		const distro = env.WSL_DISTRO_NAME || "Ubuntu";
		return `file://wsl.localhost/${encodeURIComponent(distro)}${encodePathSegments(target)}`;
	}
	if (platform === "windows") {
		const normalized = target.replaceAll("\\", "/");
		const encoded = encodePathSegments(normalized).replace(/^([A-Za-z])%3A\//, "$1:/");
		return `file:///${encoded}`;
	}
	return `file://${encodePathSegments(target)}`;
}

export function buildOpenCommand(
	platform: DesktopPlatform,
	path: string,
	reveal: boolean,
	windowsPath = path,
): OpenCommand {
	switch (platform) {
		case "macos":
			return reveal ? { command: "open", args: ["-R", path] } : { command: "open", args: [path] };
		case "windows":
			return reveal
				? { command: "explorer.exe", args: [`/select,${path}`] }
				: { command: "cmd.exe", args: ["/c", "start", "", path] };
		case "wsl":
			return reveal
				? { command: "explorer.exe", args: [`/select,${windowsPath}`] }
				: { command: "cmd.exe", args: ["/c", "start", "", windowsPath] };
		case "linux":
			return { command: "xdg-open", args: [reveal ? dirname(path) : path] };
	}
}
