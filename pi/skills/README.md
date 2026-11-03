# @ripgrim/pi-skills

Curated global Pi skills for ripgrim’s setup.

## Install

```bash
pi install ./pi/skills
```

## Included

- `break-it`
- `pierre-diff`
- `show-me`
- `state-machine`
- `understand-pr`
- `variant`

The proactive UI, verification, and review skills were adapted from [`jal-co/jalco-dotfiles`](https://github.com/jal-co/jalco-dotfiles). Exact imported paths and the source commit are recorded in [`UPSTREAM.json`](./UPSTREAM.json). `pierre-diff` is the local companion skill for `@ripgrim/pi-pierre-diff`.

Local adaptations remove private dependencies, preserve explicit authorization boundaries, and target the public Pi extension/tooling APIs.
