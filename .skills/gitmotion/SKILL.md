---
name: gitmotion
description: Transform GitHub Pull Requests into motion-design videos. Inspects PRs, generates motion concepts with Claude, renders videos via Remotion, and creates tweet text. Use when user wants to create a video from a GitHub PR, mentions "gitmotion", "motion design", or wants to visualize code changes.
---

# GitMotion

Generate motion-design videos from GitHub Pull Requests and create social media content.

## Quick Start

```
Create a video for PR #123 in the ripgrim/repo-name repository
```

This will:
1. Fetch PR details from GitHub
2. Generate a motion concept (colors, theme, scenes)
3. Render a 10-second vertical video (1080x1920)
4. Generate tweet text

Output: Video file path + suggested tweet text.

## Configuration

Required environment variables (set in your system or Claude Code settings):
- `GITHUB_TOKEN` - GitHub personal access token
- `GITHUB_REPO_OWNER` - Repository owner (e.g., "ripgrim")
- `GITHUB_REPO_NAME` - Repository name (e.g., "my-repo")

These can also be passed per-request.

## Usage Examples

```
Create a gitmotion video for PR 456
```

```
Make a motion video for PR 789 in owner/repo
```

```
Generate a video concept for the latest PR
```

## Video Styles

The agent automatically selects a style based on PR characteristics:
- **Large changes (500+ lines)** → Tech showcase (dark, neon accents)
- **Bug fixes** → Clean minimal (light, smooth animations)
- **Features** → Bold brutalist (high contrast, energetic)

## Output

Videos are saved to: `./out/videos/pr-<number>.mp4`

Each video is:
- 10 seconds long
- 1080x1920 (9:16 vertical for social media)
- 30 FPS
- MP4 format

## Tools

This skill provides tools for:
- `inspect_pr` - Fetch PR details from GitHub
- `generate_concept` - Create motion concept (colors, scenes, timing)
- `render_video` - Render video via Remotion
- `generate_tweet` - Write tweet text

You can use these tools individually or let the skill orchestrate them automatically.
