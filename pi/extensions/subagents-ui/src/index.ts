// Local behavior fork of pi-subagents 0.84.0.
// The npm package remains configured for its skills/prompts, while its upstream
// extension entrypoint is disabled in settings.json. This wrapper loads the
// patched local bundle from lib/forks/pi-subagents.
export { default } from "../vendor/pi-subagents/bundle/index.js";
