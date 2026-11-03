# Pi Atelier data-sidebar fork

Local behavior fork of `pi-atelier@0.18.0`.

The full Atelier extension is loaded from this fork. It keeps the upstream responsive split-pane, `/atelier` commands, F6 control center, resize behavior, metrics collection, activity tracking, usage accounting, and sidebar lifecycle.

Local presentation changes:

- borderless, compact panels matching Atelier's data-dense package preview;
- 38-column default width;
- Project and Session are visually separate sections;
- Project/Git appears first;
- compact model/provider/thinking/state Agent section;
- visible Project, Agent, Activity, Alerts, Context, Usage, Subagents, and Tools sections;
- tool names remain visible at the narrower width;
- plain-text font mode by default;
- Atelier footer disabled so Powerline remains authoritative;
- prefill and completion notifications disabled by default;
- terminal-safe function keys: F6 control center, F7 toggle, F8 resize (replacing unreliable Ctrl+Shift letter chords);
- local `grim:changes` panel support and a sidebar-yield event so the F9 Changes workspace can use the full terminal, then restore Atelier on close.

The separate `extensions/subagent-panel.ts` is intentionally unchanged from its original drawer behavior.

Upstream: https://github.com/michaelmjhhhh/pi-atelier  
License: MIT (`LICENSE`)  
Fork generation: `data-v2`

`data-v2` adds the CHANGES contribution placement, full-screen workspace sidebar yielding, and centralized custom-keybinding registration.
