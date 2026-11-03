# Pi install commands

The preferred complete install is:

```bash
./pi/install.sh
```

The equivalent package commands are listed below for selective/manual setup.

## Third-party packages

```bash
pi install npm:opencode-pi@1.5.0
pi install npm:@plannotator/pi-extension@0.28.47
pi install npm:pi-powerline-footer@0.22.0
pi install npm:pi-subagents@0.84.0
pi install npm:pi-btw@0.8.0
pi install npm:@narumitw/pi-inspect@0.4.1
pi install npm:pi-context-view@0.8.2
pi install npm:@pi-unipi/kanboard@3.0.1
pi install npm:@juicesharp/rpiv-ask-user-question@2.15.0
pi install npm:@narumitw/pi-usage@0.69.1
pi install git:github.com/zerray/pi-remote-control@ad1f5ba0a563974ba4cbf897fe989154a282989b
```

After installing `pi-subagents`, configure that package with `extensions: []` in `~/.pi/agent/settings.json` when using `@ripgrim/pi-subagents-ui`. The complete installer does this automatically.

## Personal extension packages

Run these from the repository root:

```bash
pi install ./pi/extensions/atelier
pi install ./pi/extensions/attachment-ux
pi install ./pi/extensions/footer-context
pi install ./pi/extensions/image-budget
pi install ./pi/extensions/keybinding-manager
pi install ./pi/extensions/pierre-diff
pi install ./pi/extensions/resource-importer
pi install ./pi/extensions/subagent-panel
pi install ./pi/extensions/subagents-ui
pi install ./pi/extensions/token-throughput
pi install ./pi/extensions/welcome-screen
```

## Curated skills

```bash
pi install ./pi/skills
```

Run `/reload` after changing packages in an existing Pi session.
