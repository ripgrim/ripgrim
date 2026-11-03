# ripgrim’s Pi setup

Reproducible, credited Pi configuration for the setup in this repository. The directory is a container for independently installable packages—not one giant extension package.

```text
pi/
├── extensions/            # one installable package per extension
│   ├── attachment-ux/
│   ├── atelier/           # credited local fork
│   ├── footer-context/
│   ├── image-budget/      # credited adaptation
│   ├── keybinding-manager/
│   ├── pierre-diff/
│   ├── resource-importer/
│   ├── subagent-panel/
│   ├── subagents-ui/      # credited local fork
│   ├── token-throughput/
│   └── welcome-screen/
├── runtime/               # shared internal registries/helpers
├── skills/                # curated global skill package
├── config/                # sanitized settings and UI configuration
├── external-packages.json # pinned third-party packages and credits
├── install.sh             # backed-up, repeatable installer
└── verify.sh              # manifests, tests, and secret scan
```

## Install from GitHub

Install the personal extension and skill suite directly from the repository root:

```bash
pi install git:github.com/ripgrim/ripgrim
```

This tracks `main`, like other Git-backed Pi packages. Run `pi config` afterward to enable or disable individual extensions or skills.

For the complete machine setup—including pinned third-party packages and sanitized UI preferences—clone the repository and run the bootstrap script:

```bash
git clone git@github.com:ripgrim/ripgrim.git ~/code/ripgrim
cd ~/code/ripgrim
./pi/install.sh
```

The installer:

1. backs up the current safe Pi configuration;
2. runs pinned `pi install` commands for third-party packages;
3. installs each personal extension package by its local path;
4. installs the curated skill package;
5. installs the global `AGENTS.md` guidance with paths resolved to the clone;
6. restores sanitized UI preferences without touching credentials, sessions, device identity, or caches.

Run `/reload` in Pi afterward.

## Individual extensions

Every extension keeps its own package manifest, README, tests, and credit. Pi’s Git source installs repositories rather than repository subdirectories, so the public GitHub command installs the root suite package:

```bash
pi install git:github.com/ripgrim/ripgrim
```

Use `pi config` to select individual resources. Direct subdirectory installs are retained for local development:

```bash
pi install ~/code/ripgrim/pi/extensions/attachment-ux
pi install ~/code/ripgrim/pi/extensions/pierre-diff
```

See each package’s `README.md` for provenance, or use the complete copyable list in [`INSTALL.md`](./INSTALL.md).

## Curated skills

The globally loaded set is intentionally small:

- `break-it`
- `pierre-diff`
- `show-me`
- `state-machine`
- `understand-pr`
- `variant`

Install it with:

The GitHub suite command installs these skills automatically:

```bash
pi install git:github.com/ripgrim/ripgrim
```

For local development, install the skill package directly with `pi install ~/code/ripgrim/pi/skills`.

The broader repository `.skills/` collection remains available for project-specific use but is not globally loaded by this setup.

## Third-party packages

Third-party packages are not copied here unless this setup maintains a real behavior fork. Exact sources, versions, authors, licenses, repositories, and notes are recorded in [`external-packages.json`](./external-packages.json), with a human-readable overview in [`CREDITS.md`](./CREDITS.md).

Examples:

```bash
pi install npm:pi-powerline-footer@0.22.0
pi install npm:pi-btw@0.8.0
pi install git:github.com/zerray/pi-remote-control@ad1f5ba0a563974ba4cbf897fe989154a282989b
```

`pi-subagents@0.84.0` remains installed for its upstream skills and prompts, while its extension entry point is filtered out in favor of the credited local UI fork.

## Machine-specific setup

The repository intentionally excludes:

- provider credentials and `auth.json`;
- session transcripts;
- device identifiers;
- caches and managed package checkouts;
- live daemon databases and pairing tokens;
- machine-specific Tailscale hostnames.

For Pi Remote Control, copy [`config/remote-control.example.json`](./config/remote-control.example.json) to `~/.pi/remote-control/config.json` and fill in the current machine’s Tailscale URL.

## Verify

```bash
./pi/verify.sh
```

This validates package manifests, runs package tests, and scans the tracked setup for common secret patterns.
