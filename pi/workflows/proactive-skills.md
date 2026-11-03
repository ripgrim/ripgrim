# Proactive skill use

Applies to ordinary Pi sessions and delegated Pi tasks using this user's configuration. Read the matching SKILL.md before applying a workflow; do not merely mention its name. Work proportionally to the request. Do not ask the user to name a skill or grant permission for routine, already-authorized local verification.

## Routing

| Situation | Skill and expected action |
| --- | --- |
| UI direction is genuinely unresolved | `variant`: explore distinct choices in a development-only picker, explain tradeoffs, and let the user choose. Do not build variants for a specified design or every minor CSS fix. |
| Stateful component is being built or polished | `state-machine`: enumerate reachable states and use an existing workbench or a temporary development-only harness when states are hard to exercise. Check loading, empty, error, disabled, permission, populated, and overflow states as relevant. Do not generate fixtures for unrelated components. |
| Forms, lists, tables, uploads, user content, or responsive layout changed | `break-it`: exercise relevant hostile/edge-case inputs through the actual running app and inspect every affected surface, including mobile. Complement existing dogfood/accessibility checks instead of repeating them. |
| Architecture, control flow, a refactor, or tradeoffs are hard to explain | `show-me`: include the smallest helpful inline diagram, tree, or diff; generate an HTML artifact only when materially clearer. |
| PR review, substantial self-review, or risk-bearing branch changes | `understand-pr`: reason independently about the problem and base branch, then review the implementation with evidence proportional to risk. A known diff cannot be reviewed blindly; say so. |

## Browser verification and screenshots

- For authorized frontend work, proactively run the relevant browser verification before declaring completion; do not leave all browser QA to the user.
- Reuse project tools, tests, dev servers, authentication fixtures, and existing preview/workbench infrastructure. Use an isolated test browser/profile; never attach to personal browsing sessions or silently import personal cookies.
- Test only local or disposable environments. Never seed junk into production or shared staging without explicit approval. Bound volume, resource use, and task scope.
- Verify the changed interaction, keyboard/focus behavior, desktop and narrow/mobile layouts, and relevant UI states. Check browser console errors and failed requests when tooling supports it.
- Screenshots are evidence, not substitutes for assertions. Use stable realistic content; match viewport, scale, theme, scroll position, and crop in comparisons. Capture the baseline before edits when comparison is needed. Hide temporary harness controls for final evidence.
- Save screenshots to files and record paths. The image-budget extension retains up to four recent images within about 12 MB of encoded data in outgoing context; it does not delete saved images. Re-read a specific saved image when older visual evidence is needed. It can omit an oversized image too; omission is not proof that an image was inspected.
- If runtime, browser tooling, test credentials, or a baseline is missing, report the precise limitation and checks not performed. Do not claim success based only on reading code. Ask before adding dependencies or bypassing authentication; do not install a browser stack merely because a skill names one.

## Delegation

When launching a child agent, include the relevant skill names and resolved absolute `SKILL.md` paths from this checkout’s `pi/skills/` directory (normally `~/code/ripgrim/pi/skills/`), the task-specific trigger, and the applicable browser/authorization requirements in its task prompt. Tell it to read and apply those files and return concrete verification evidence. Keep verification and cleanup scoped to its own task. Do not assume non-Pi agents, custom system prompts, SDK resource loaders, `--no-skills`, or alternate agent directories inherit this configuration.

Standard Pi processes using the normal agent directory load the globally registered local package. Preserve that resource loading when spawning them; do not silently strip skills/extensions. If a custom launcher suppresses global resources, explicitly supply the workflow and skill paths (and load image-budget separately if supported). This guidance cannot force an independent launcher to load extensions.

## Authority and completion

Proactive means choosing and executing relevant local workflows within the user's request. It does not authorize production data changes, personal-browser access, dependency installation, external publication, commits/pushes, PR comments, merges, or unrelated refactors. Confirm those separately when not already authorized.

Fix task-introduced issues during authorized implementation and re-test. For a standalone review, report issues instead of changing code unasked. Hand over design choices rather than choosing for the user. Keep user-facing reporting concise: what was checked, what actually happened, evidence paths/URLs, and anything unverified. No unnecessary harnesses, ceremonial checklists, waiting loops, or duplicate QA passes.
