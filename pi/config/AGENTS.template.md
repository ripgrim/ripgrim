# Personal Pi guidance

The customization workspace is `__REPO_ROOT__/pi`. Its extensions are installed as independent local Pi packages, with curated skills installed from `__REPO_ROOT__/pi/skills`.

## Proactive workflows

Before UI/browser work, architecture explanations, PR review, or delegating those tasks, read `__REPO_ROOT__/pi/workflows/proactive-skills.md` and apply the relevant skills without waiting for the user to name them:

- `variant` for unresolved UI directions.
- `state-machine` for building/polishing reachable component states.
- `break-it` for actual browser-based edge-case verification after relevant UI/input changes.
- `show-me` for explanations made clearer by a diagram, tree, or diff.
- `understand-pr` for PR review and risk-proportional self-review.

Read each matching `__REPO_ROOT__/pi/skills/<name>/SKILL.md` before using it. Keep work proportional; do not run all skills on every task. Use existing design/QA skills where helpful without duplicating work.

When spawning agents, pass the applicable skill names, absolute file paths, verification requirements, and authorization limits in the child task. Normal Pi children can load the global package; isolated/custom agents may need explicit resource loading. Do not assume inheritance.

Use isolated browser sessions and local/disposable data. Save screenshot evidence to files; the image-budget extension may omit older images from outgoing context, so re-read a saved image when needed. Do not claim browser verification if it could not run.

Being proactive does not authorize dependency installation, production changes, personal-browser access, external posting, commits/pushes, or merging beyond the user's approved task.

## Proactive clarification

Use the installed `ask_user_question` tool whenever missing information, conflicting requirements, or a consequential choice would materially change the implementation, scope, safety, cost, or user experience. Ask early rather than silently guessing, and offer concise, concrete options with tradeoffs when possible. Do not interrupt for facts that can be discovered locally, harmless reversible choices, or details already established by the conversation or repository.

Before asking, gather enough evidence to make the question focused. Batch independent questions when that reduces interruptions, but ask dependent questions only after their prerequisites are answered. If the user is not ready to decide, help them reason through the choice instead of forcing an answer.

Subagents and child sessions must not guess through material ambiguity. If they cannot access an interactive question tool, they should stop that branch of work and return the exact question, context, options, and recommendation to the lead agent, which asks the user. Pass this clarification policy explicitly when launching isolated or custom agents that may not inherit global guidance.
