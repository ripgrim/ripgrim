# Credits and provenance

This setup separates original personal integrations, adapted resources, maintained forks, and externally installed packages.

## Maintained here

The following packages are personal Pi integrations maintained by [ripgrim](https://github.com/ripgrim):

- `@ripgrim/pi-attachment-ux`
- `@ripgrim/pi-footer-context`
- `@ripgrim/pi-keybinding-manager`
- `@ripgrim/pi-pierre-diff`
- `@ripgrim/pi-resource-importer`
- `@ripgrim/pi-subagent-panel`
- `@ripgrim/pi-token-throughput`
- `@ripgrim/pi-welcome-screen`

They use the public [Pi](https://pi.dev) extension APIs. Individual package READMEs describe integrations and dependencies in more detail.

## Adapted resources

The following resources were adapted from [jal-co/jalco-dotfiles](https://github.com/jal-co/jalco-dotfiles):

- `@ripgrim/pi-image-budget`
- `break-it`
- `show-me`
- `state-machine`
- `understand-pr`
- `variant`

The exact upstream commit and imported paths are recorded in [`skills/UPSTREAM.json`](./skills/UPSTREAM.json). Local adaptations remove private dependencies, tighten authorization boundaries, and target this public Pi setup.

## Maintained forks

### Pi Atelier

`@ripgrim/pi-atelier` is a behavior and presentation fork of [`pi-atelier`](https://github.com/michaelmjhhhh/pi-atelier) version `0.18.0`. Upstream is MIT licensed. Its license and fork notes are preserved under `extensions/atelier/vendor/pi-atelier/`.

### Pi Subagents

`@ripgrim/pi-subagents-ui` is a behavior/UI fork of [`pi-subagents`](https://github.com/nicobailon/pi-subagents) by **Nico Bailon**, version `0.84.0`, MIT. Its license, package metadata, and fork notes are preserved under `extensions/subagents-ui/vendor/pi-subagents/`.

The upstream npm package remains installed—with its extension filtered out—to provide its original skills and prompts.

## External packages

External packages are installed from their original sources rather than copied. Exact versions, authors, licenses, repositories, and special configuration notes are machine-readable in [`external-packages.json`](./external-packages.json).

Notable authors and projects include:

- **Nico Bailon** — Pi Powerline Footer and Pi Subagents
- **backnotprop** — Plannotator
- **Dan Bachelder** — Pi BTW
- **Dmitry Makarov** — Pi Context View
- **Neuron Mr White** — UniPi Kanboard
- **juicesharp** — Ask User Question
- **narumitw** — Pi Inspect and Pi Usage
- **zerray** — Pi Remote Control
- **pi-extensions contributors / luongnv89** — OpenCode Pi

No ownership of those projects is implied by their inclusion in this personal setup.
