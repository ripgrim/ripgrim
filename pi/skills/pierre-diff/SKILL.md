---
name: pierre-diff
description: Present file changes in the interactive Pierre-style TUI diff viewer. Use when the user asks to see, show, inspect, or review a diff of changes the agent made to a file.
---

# Pierre diff

Use the `show_file_diff` tool when the user asks to see one file's changes. For a session-wide review across main-agent and subagent edits, tell the user to open the F9 or `/changes` workspace. The user can also click the explicit `[diff]` action beside any `edit` path in the main chat or mirrored subagent drawer to open the exact patch for that individual tool call; the path itself is inert.

## Baselines

- Prefer `baseline: "agent"`. It compares the file as it existed before the first `edit` or `write` call in the relevant agent turn against the current file, excluding pre-existing dirty changes.
- Use `baseline: "git"` when the user asks for the complete working-tree diff against Git HEAD.
- If the agent baseline is unavailable because changes were made through shell commands or before tracking began, explain that briefly and retry with the Git baseline when appropriate.

## Path

Pass the specific file path when the user names one. If they ask generally and several files changed, omit `path` so the user can select a file in the TUI.

Do not paste a large raw patch into chat unless the user explicitly asks for text. Open the TUI viewer instead.
