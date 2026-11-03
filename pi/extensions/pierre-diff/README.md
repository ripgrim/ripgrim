# @ripgrim/pi-pierre-diff

## Pierre Diff

Tracks exact edits and opens an agent-aware Changes workspace with Pierre-style diffs.

![Pierre Diff TUI showing a stacked Git diff for README.md](./assets/screenshot.png)

## Install

Install the public package directly from GitHub:

```bash
pi install git:github.com/ripgrim/ripgrim
```

The repository root is the distributable Pi package and exposes every extension in this suite. Use `pi config` to enable or disable individual resources.

For local development from a clone, this package can also be loaded directly:

```bash
pi install ./pi/extensions/pierre-diff
```

Run `/reload` in an existing Pi session after installation.

## Credit

Personal integration maintained by [ripgrim](https://github.com/ripgrim). It uses the sidebar registration surface from the local Atelier fork and visual conventions from the Pierre ecosystem; it is not an official Pierre package.

## Development

This package is part of the personal Pi suite under `pi/`. Shared cross-package helpers live in `../../runtime/`.
