# @ripgrim/pi-image-budget

## Image Budget

Keeps outgoing image context bounded while preserving saved files and transcript history.

![Behavior diagram showing Image Budget pruning model-bound image context while preserving files and transcripts](./assets/screenshot.png)

## Install

Install the public package directly from GitHub:

```bash
pi install git:github.com/ripgrim/ripgrim
```

The repository root is the distributable Pi package and exposes every extension in this suite. Use `pi config` to enable or disable individual resources.

For local development from a clone, this package can also be loaded directly:

```bash
pi install ./pi/extensions/image-budget
```

Run `/reload` in an existing Pi session after installation.

## Credit

Adapted from [`jal-co/jalco-dotfiles`](https://github.com/jal-co/jalco-dotfiles), source commit recorded in `../../skills/UPSTREAM.json`. Local adaptations are maintained by [ripgrim](https://github.com/ripgrim).

## Development

This package is part of the personal Pi suite under `pi/`. Shared cross-package helpers live in `../../runtime/`.
