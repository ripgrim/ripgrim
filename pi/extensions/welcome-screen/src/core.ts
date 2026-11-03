export interface RecentSessionLike {
	path: string;
	cwd: string;
	name?: string;
	modified: Date;
	messageCount: number;
	firstMessage: string;
}

export interface WelcomeRecentSession {
	path: string;
	label: string;
	project: string;
	modified: Date;
}

export function projectName(cwd: string): string {
	if (!cwd) return "unknown";
	const normalized = cwd.replace(/[\\/]+$/, "");
	const parts = normalized.split(/[\\/]/).filter(Boolean);
	return parts.at(-1) ?? cwd;
}

export function compactWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function selectRecentSessions(
	sessions: RecentSessionLike[],
	currentSessionFile: string | undefined,
	limit = 3,
): WelcomeRecentSession[] {
	return sessions
		.filter((session) => session.path !== currentSessionFile && session.messageCount > 0)
		.sort((a, b) => b.modified.getTime() - a.modified.getTime())
		.slice(0, limit)
		.map((session) => ({
			path: session.path,
			label: compactWhitespace(session.name || session.firstMessage || "Untitled session"),
			project: projectName(session.cwd),
			modified: session.modified,
		}));
}

export function formatRelativeTime(date: Date, now = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
	if (seconds < 60) return "now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	const weeks = Math.floor(days / 7);
	return `${weeks}w ago`;
}
