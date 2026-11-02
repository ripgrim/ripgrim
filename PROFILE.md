# Animated profile README

The README and SVG panels are generated from [`profile.config.json`](./profile.config.json).

## Change what appears

- `github.featuredRepos`: large highlighted project cards, in order.
- `github.moreRepos`: compact repository list.
- `profile`: name, intro, status, focus, state, and the complete bottom `links` strip. Add, remove, reorder, relabel, or retarget links directly in the config (up to six).
- `theme`: Sodium surface, text, rule, status, and aurora colors.
- `motion`: global speed, aurora loop duration/FPS, and pending-mark timing.
- `effects`: ordered dithering, aurora animation, and pending-mark toggles.
- `layout`: width and optional metadata.

Repository names can be `name` (uses `github.username`) or `owner/name`. This works for organizations and other accounts, for example `Boring-Software-Inc/dither-kit`.

## Preview locally

```bash
npm run check
npm run build
```

Then open `README.md` on GitHub, or open the files in `profile/generated/` directly in a browser. The build uses Node's standard library only; there are no packages to install.

## Automatic updates

`.github/workflows/main.yml` runs daily and on configuration/generator changes. It fetches current descriptions, languages, stars, forks, update dates, and account totals from the GitHub API, rebuilds the assets, and commits only when output changes.

SVG motion uses SMIL because GitHub profile READMEs strip JavaScript and inline page CSS. The aurora is rendered as discrete ordered-dither frames, while `prefers-reduced-motion` shows a still first frame. The rest of the profile follows Sodium's square, ruled, warm near-black system with Commit Mono embedded directly in each SVG.

Commit Mono is included under its MIT license in `fonts/CommitMono-LICENSE`.
