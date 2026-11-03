import assert from "node:assert/strict";
import test from "node:test";
import {
	absoluteToolPath,
	buildOpenCommand,
	desktopFileUrl,
	detectDesktopPlatform,
	isClipboardImagePath,
} from "./src/core.ts";

test("recognizes Pi clipboard image files without treating ordinary paths as image chips", () => {
	assert.equal(isClipboardImagePath("/tmp/pi-clipboard-1234.png"), true);
	assert.equal(isClipboardImagePath("C:\\Temp\\pi-clipboard-1234.webp"), true);
	assert.equal(isClipboardImagePath("/tmp/pi-clipboard-1234.txt"), false);
	assert.equal(isClipboardImagePath("/tmp/screenshot.png"), false);
	assert.equal(isClipboardImagePath("/tmp/pi-clipboard-a.png\n/tmp/pi-clipboard-b.png"), false);
});

test("detects desktop hosts including WSL", () => {
	assert.equal(detectDesktopPlatform("darwin", {}), "macos");
	assert.equal(detectDesktopPlatform("win32", {}), "windows");
	assert.equal(detectDesktopPlatform("linux", { WSL_DISTRO_NAME: "Ubuntu" }), "wsl");
	assert.equal(detectDesktopPlatform("linux", {}), "linux");
});

test("builds default-open and reveal commands for each desktop", () => {
	assert.deepEqual(buildOpenCommand("macos", "/tmp/a.png", false), {
		command: "open",
		args: ["/tmp/a.png"],
	});
	assert.deepEqual(buildOpenCommand("macos", "/tmp/a.png", true), {
		command: "open",
		args: ["-R", "/tmp/a.png"],
	});
	assert.deepEqual(buildOpenCommand("wsl", "/tmp/a.png", false, "C:\\Temp\\a.png"), {
		command: "cmd.exe",
		args: ["/c", "start", "", "C:\\Temp\\a.png"],
	});
	assert.deepEqual(buildOpenCommand("wsl", "/tmp/a.png", true, "C:\\Temp\\a.png"), {
		command: "explorer.exe",
		args: ["/select,C:\\Temp\\a.png"],
	});
	assert.deepEqual(buildOpenCommand("linux", "/tmp/a.png", true), {
		command: "xdg-open",
		args: ["/tmp"],
	});
});

test("builds terminal-native file hyperlinks, including WSL UNC links", () => {
	assert.equal(desktopFileUrl("linux", "/tmp/a b.png", false, {}), "file:///tmp/a%20b.png");
	assert.equal(desktopFileUrl("linux", "/tmp/a b.png", true, {}), "file:///tmp");
	assert.equal(
		desktopFileUrl("wsl", "/tmp/a b.png", false, { WSL_DISTRO_NAME: "Ubuntu 24.04" }),
		"file://wsl.localhost/Ubuntu%2024.04/tmp/a%20b.png",
	);
	assert.equal(
		desktopFileUrl("windows", "C:\\Temp\\a b.png", false, {}),
		"file:///C:/Temp/a%20b.png",
	);
});

test("resolves tool paths and strips Pi's optional @ prefix", () => {
	assert.equal(absoluteToolPath("@images/a.png", "/work/project"), "/work/project/images/a.png");
	assert.equal(absoluteToolPath("/tmp/a.png", "/work/project"), "/tmp/a.png");
});
