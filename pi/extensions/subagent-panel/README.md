# @ripgrim/pi-subagent-panel

## Subagent Panel

Terminal-independent in-Pi inspector for active and retained subagent runs.

![Behavior diagram of the Subagent Panel fleet list and child transcript drawer](./assets/screenshot.png)

## Install

Install the public package directly from GitHub:

```bash
pi install git:github.com/ripgrim/ripgrim
```

The repository root is the distributable Pi package and exposes every extension in this suite. Use `pi config` to enable or disable individual resources.

For local development from a clone, this package can also be loaded directly:

```bash
pi install ./pi/extensions/subagent-panel
```

Run `/reload` in an existing Pi session after installation.

## Credit

Original personal integration maintained by [ripgrim](https://github.com/ripgrim), designed for Nico Bailon’s [`pi-subagents`](https://github.com/nicobailon/pi-subagents).

## Development

This package is part of the personal Pi suite under `pi/`. Shared cross-package helpers live in `../../runtime/`.
