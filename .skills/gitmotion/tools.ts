/**
 * GitMotion Tools for Claude Code
 *
 * These tools can be invoked by Claude to create videos from PRs
 */

import { Octokit } from 'octokit';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Tool: Inspect a GitHub PR
 */
export async function inspectPR(args: {
  owner?: string;
  repo?: string;
  prNumber: number;
}) {
  const owner = args.owner || process.env.GITHUB_REPO_OWNER;
  const repo = args.repo || process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !token) {
    throw new Error('Missing GITHUB_REPO_OWNER, GITHUB_REPO_NAME, or GITHUB_TOKEN');
  }

  const octokit = new Octokit({ auth: token });

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: args.prNumber,
  });

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: args.prNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    author: pr.user?.login,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    labels: pr.labels.map((l: any) => l.name),
    files: files.map((f: any) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
    })),
    url: pr.html_url,
  };
}

/**
 * Tool: Generate motion concept
 */
export async function generateConcept(pr: any): Promise<{
  concept: string;
  visualStyle: any;
  scenes: any[];
  duration: number;
}> {
  // Determine style based on PR characteristics
  let theme = 'dark';
  let animationStyle = 'snappy';

  if (pr.labels?.some((l: string) => l.toLowerCase().includes('bug'))) {
    theme = 'light';
    animationStyle = 'smooth';
  } else if (pr.additions > 500) {
    theme = 'cyberpunk';
    animationStyle = 'bouncy';
  }

  const palettes: Record<string, string[]> = {
    dark: ['#0a0a0a', '#1a1a1a', '#00ff9f', '#ffffff'],
    light: ['#ffffff', '#f5f5f5', '#3b82f6', '#000000'],
    cyberpunk: ['#000000', '#1a0a2e', '#ff00ff', '#00ffff'],
  };

  return {
    concept: `Video for PR #${pr.number}: ${pr.title}`,
    visualStyle: {
      theme,
      colorPalette: palettes[theme] || palettes.dark,
      font: 'JetBrains Mono',
      animationStyle,
    },
    scenes: [
      {
        time: 0,
        duration: 3500,
        content: `${pr.title}\nby @${pr.author}`,
      },
      {
        time: 3500,
        duration: 3500,
        content: `+${pr.additions} lines changed\n${pr.changedFiles} files modified`,
      },
      {
        time: 7000,
        duration: 3000,
        content: `Check it out:\n${pr.url}`,
      },
    ],
    duration: 10,
  };
}

/**
 * Tool: Render video via Remotion
 */
export async function renderVideo(concept: any, prNumber: number): Promise<string> {
  const outDir = path.join(process.cwd(), 'out');
  await fs.mkdir(outDir, { recursive: true });

  // Save concept
  const conceptPath = path.join(outDir, 'concept.json');
  await fs.writeFile(conceptPath, JSON.stringify({
    prNumber,
    ...concept,
  }, null, 2));

  // Check for Remotion
  const remotionDir = path.join(process.cwd(), 'remotion');
  const remotionExists = await fs.access(remotionDir).then(() => true).catch(() => false);

  if (!remotionExists) {
    throw new Error('Remotion not found. Please set up the remotion/ directory first.');
  }

  // Render
  const videoPath = path.join(outDir, `pr-${prNumber}.mp4`);

  await new Promise<void>((resolve, reject) => {
    const cmd = process.platform === 'win32' ? 'cmd' : 'sh';
    const args = process.platform === 'win32'
      ? ['/c', 'cd', '/d', remotionDir, '&&', 'bunx', 'remotion', 'render', 'PRVideo', '../out/video.mp4', '--overwrite', '--jpeg-quality=80']
      : ['-c', `cd "${remotionDir}" && bunx remotion render PRVideo ../out/video.mp4 --overwrite --jpeg-quality=80`];

    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Remotion exited with code ${code}`));
    });

    proc.on('error', reject);
  });

  // Move to final location
  const renderedPath = path.join(remotionDir, 'out', 'video.mp4');
  await fs.copyFile(renderedPath, videoPath);

  return videoPath;
}

/**
 * Tool: Generate tweet
 */
export async function generateTweet(pr: any): Promise<string> {
  const url = pr.url;

  const templates = [
    `🎬 Just shipped: ${pr.title}\n\n🔧 PR #${pr.number} by @${pr.author}\n\n${url}\n\n#DevShowcase #Coding`,
    `✨ ${pr.title}\n\nSee what changed 👇\n\n${url}\n\nby @${pr.author} #OpenSource`,
    `💻 Code in motion\n\n${pr.title}\n\n${url}`,
  ];

  let templateIndex = 0;
  if (pr.additions > 500) templateIndex = 0;
  else if (pr.additions < 100) templateIndex = 2;
  else templateIndex = 1;

  return templates[templateIndex];
}

/**
 * Main: Create video from PR (orchestrates all tools)
 */
export async function createVideo(args: {
  owner?: string;
  repo?: string;
  prNumber: number;
}): Promise<{
  videoPath: string;
  tweet: string;
  pr: any;
}> {
  // Step 1: Inspect PR
  const pr = await inspectPR(args);

  // Step 2: Generate concept
  const concept = await generateConcept(pr);

  // Step 3: Render video
  const videoPath = await renderVideo(concept, pr.number);

  // Step 4: Generate tweet
  const tweet = await generateTweet(pr);

  return {
    videoPath,
    tweet,
    pr,
  };
}
