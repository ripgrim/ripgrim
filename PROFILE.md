# Animated profile README

The README and SVG panels are generated from [`profile.config.json`](./profile.config.json).

## Change what appears

- `github.featuredRepos`: highlighted project cards, in order. Each entry independently controls its destination, action label/style, OG source page, and banner.
- `github.moreRepos`: compact repository list.
- `projects`: global banner enablement, automatic GitHub Open Graph image lookup, and banner height.
- `profile`: name, intro, status, focus, state, and the complete bottom `links` strip. Add, remove, reorder, relabel, or retarget links directly in the config (up to six).
- `theme`: Sodium surface, text, rule, status, and aurora colors.
- `motion`: global speed, aurora loop duration/FPS, and pending-mark timing.
- `effects`: ordered dithering, aurora animation, and pending-mark toggles.
- `layout`: width and optional metadata.

Repository names can be `name` (uses `github.username`) or `owner/name`. This works for organizations and other accounts, for example `Boring-Software-Inc/dither-kit`.

A featured repository may be a plain string or an object:

```json
{
  "repo": "Boring-Software-Inc/dither-kit",
  "solidButton": false,
  "ctaLabel": "Visit project",
  "projectUrl": "https://tripwire.sh/dither-kit",
  "showBanner": true,
  "autoOgImage": true,
  "ogSourceUrl": "https://tripwire.sh/dither-kit",
  "bannerUrl": ""
}
```

`projectUrl` is only the destination when someone clicks the featured card. `ctaLabel` controls the visible action text, such as `View source` or `Visit project`; set it to `null` to omit the CTA entirely while keeping the whole card clickable. `ogSourceUrl` is only the webpage inspected for its `og:image`, so a project can link to one URL while sourcing its banner from another. Leave either URL empty to fall back to the repository URL. `bannerUrl` is a direct image override and skips OG discovery.

A banner renders only when both the global `projects.bannersEnabled` switch and the entry's `showBanner` switch are enabled. Automatic OG lookup additionally requires both `projects.autoOgImages` and `autoOgImage`. Set global `projects.bannerFit` to `contain` to show the complete image or `cover` to crop it edge-to-edge. `bannerHeight` controls the available image area.

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
