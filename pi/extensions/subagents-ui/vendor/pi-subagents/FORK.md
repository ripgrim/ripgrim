# Local pi-subagents behavior fork

Upstream: `pi-subagents@0.84.0`

Loaded by: `~/code/ripgrim/pi/extensions/forked-subagents.ts`

Reload generation: `ui-v4`. The versioned directory gives `/reload` a new module graph instead of reusing Node's cached copy of the prior fork.

The upstream npm package remains configured with `extensions: []` so its skills and prompts stay available without loading its extension twice.

Local behavior changes:

1. Compact Fleet async-child selection opens the registered inspector directly with one Enter instead of opening the wide Fleet dialog first.
2. The registered personal inspector is `~/code/ripgrim/pi/extensions/subagent-panel.ts`, a narrow in-Pi right panel with cross-run workflow sibling cycling.
3. Tool-call spacing is configured through `~/.pi/agent/extensions/subagent/config.json` (the tracked template is `pi/config/subagent.json`) so headings render as `subagent worker [async]`.

The copied bundle, source support files, built-in agents, and runner scripts are intentionally version-pinned. When updating upstream, refresh this directory from the new package, reapply the direct-inspector callback patch in `bundle/chunk-235AWJUQ.js`, then run the personal test suite and real TUI verification.

`ui-v3` preserves `parentWorkflowRunId` and `workflowKey` in inspector targets so a drawer opened from an individual materialized worker can discover and cycle its workflow siblings.

`ui-v4` propagates the Pierre change-journal extension and actor identity into child Pi sessions so main-agent and subagent file changes share one session Changes workspace.
