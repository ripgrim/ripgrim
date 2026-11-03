# @ripgrim/pi-keybinding-manager

## Keybinding Manager

Full-screen editor for native Pi and registered extension bindings.

![Pi keybinding manager with extension and native keybindings in a two-pane workspace](./assets/screenshot.png)

## Install

Install the public package directly from GitHub:

```bash
pi install git:github.com/ripgrim/ripgrim
```

The repository root is the distributable Pi package and exposes every extension in this suite. Use `pi config` to enable or disable individual resources.

For local development from a clone, this package can also be loaded directly:

```bash
pi install ./pi/extensions/keybinding-manager
```

Run `/reload` in an existing Pi session after installation.

## Credit

Original personal extension maintained by [ripgrim](https://github.com/ripgrim). Uses the shared `@ripgrim/pi-runtime` keybinding registry.

## Development

This package is part of the personal Pi suite under `pi/`. Shared cross-package helpers live in `../../runtime/`.
