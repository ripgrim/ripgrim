---
name: understand-pr
description: Review a PR or substantial branch diff by forming an independent model before reading the changes, then checking implementation, history, and evidence. Use proactively for PR review, self-review before handoff, re-review, and risk-bearing code changes; scale effort to risk and avoid a full review ritual for trivial edits.
---

# Understand PR

Adapted from jal-co/jalco-dotfiles. Preserve the independent-design-first methodology, without private tooling, goal extensions, or automatic GitHub posting.

## Authorization and scope

A review request authorizes inspection, local verification, and a local report, not posting to GitHub, committing, pushing, opening issues, merging, or changing the author's branch. Obtain explicit authorization for those actions, including on draft/self-authored PRs. Never infer publishing approval from ownership or a request to be proactive.

Within an authorized implementation task, self-review your work and fix task-introduced problems. For a standalone review, experiment only in a disposable worktree or temporary project; report findings rather than changing the live checkout.

Use available tools, such as Git and authenticated GitHub CLI. No goal/todo extension, Mastra service, or private skill is required. Missing network, credentials, or runtime is a limitation to report, not permission to bypass checks.

## 1. Form the independent model

Resolve the PR and base branch. Before reading the changed-file list, diff, PR branch, commits, CI, or review discussion, use only the problem statement, linked problem context, base-branch code, and repository guidance.

Record:
- Required outcome and actual constraints, separate from the proposed solution.
- How the base branch works and the root cause or design pressure.
- The simplest sufficient design, including what machinery you would not add.
- A valuable regression test and the evidence needed to approve.

Do not run unqualified `git log` first: the current checkout may reveal the proposal. If the diff is already known (for example during self-review), disclose that and build the best independent model possible; do not pretend the review was blind.

Keep a concise review record outside tracked files, using the project's established ignored scratch directory or a temporary directory. Never stage it. For a short review the chat report may suffice. Freeze the pre-diff model before opening the proposal.

Read `references/archaeology.md` for metadata/history recipes as needed. Before evaluating the change, read `references/categories/README.md` and the category pages relevant to its behavior and risks. Use them to guide judgment, not as an obligatory command checklist.

## 2. Understand the change

Read the overview and the 1–3 core hunks first, then trace callers, sibling behavior, failure paths, public contracts, and tests. Reassess categories as new boundaries appear. Read existing review conversation to avoid repeating resolved findings. CI results are evidence to investigate, not findings by themselves.

Ask:
- Does the implementation meet the actual problem, and does the description match it?
- Does it fix the cause rather than a display-site symptom?
- What existing behavior, callers, and contracts rely on the old mechanism?
- What assumptions are enforced, and what happens when they fail?
- Were checks, awaits, tests, or error reporting removed?
- Is the approach and ownership appropriate? Could an existing primitive solve it more simply?
- Does a test fail for the right reason without the fix, or merely mirror the implementation?

Investigate boundaries in proportion to risk: untrusted input, filesystem/network access, concurrency, streaming, cancellation, serialized state, mixed versions, packaging, hot paths, and platform behavior including Windows.

## 3. Use history where it can change the verdict

Check blame, `git log -S`, originating PRs/issues, reverts, and related work when established behavior or unclear rationale matters. Follow deeper when there is repeated churn, a workaround, or a regression. Stop when the evidence supports a decision; do not do archaeology merely to look thorough.

## 4. Verify material claims

Choose the smallest useful probe that could falsify each important claim:
- Bug fix: show that the regression test/control exposes the original failure and the fix resolves it.
- Refactor: test behavior-preservation boundaries and meaningful edge cases.
- Public API/packaging: consume through the supported entry point.
- Performance: compare identical realistic inputs before and after.
- Storage: test old/new data and mixed-version/rollback boundaries as relevant.
- UI: exercise the actual rendered feature with isolated browser tooling; read `../break-it/SKILL.md` and test the relevant inputs/surfaces on a local or disposable environment. No production seeding or personal browser sessions.

Prefer the project's existing tests and browser tools. Ask before adding dependencies. Clearly distinguish code reasoning from executed checks and screenshots from assertions. If a probe cannot run, name the missing evidence and its effect on confidence. Do not invent pointers, results, or a clean console.

## 5. Judge the approach and brief

For open PRs use **approve**, **request changes**, or **needs discussion**. For merged/closed PRs use **no follow-up needed**, **follow-up needed**, or **revert candidate**. Judge whether scope and architecture are justified, not only whether the code executes.

Every required change needs a real file/line pointer, observed or well-supported consequence, evidence, and a concrete resolution. Distinguish optional suggestions from blockers; do not manufacture findings to fill a report. Reassess requests against contrary evidence and verify that following them would actually solve the problem without conflicting changes.

Lead the chat report with the verdict and one-line mechanism, then consequential findings, verification performed versus unverified limitations, genuine decisions, and the review-record path when one exists. Use `references/templates.md` for examples, not mandatory formatting. Keep the report proportional to the findings.

Finish the review pass after reporting. Do not require the user to explicitly end a goal or keep an agent alive waiting for ceremonial approval. Stay available for follow-up normally.

## Re-review

Read the existing record, inspect only the changes and new discussion, and report resolved / still open / new findings. Reuse the independent model and relevant category guidance. Re-check authorization before any external action.

## Publishing, only when explicitly authorized

Draft the body in a file and confirm the intended target and scope of the user's approval. Discuss code, not the author; be direct, specific, calm, and evidence-based. Use the appropriate GitHub review mode; self-authored PRs may require an ordinary comment instead. Never let a verdict contradict its required changes. Report the posted URL. Publishing authorization does not authorize code pushes, merges, issue creation, or other external actions.

## References

- `references/archaeology.md` — metadata, history, and verification recipes; this skill's authorization rules override upstream posting examples.
- `references/categories/README.md` — category index and risk-specific review guidance.
- `references/templates.md` — examples; use a genuinely ignored scratch location or temporary directory rather than assuming the example path is ignored.
