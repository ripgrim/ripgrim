#!/usr/bin/env bash
set -euo pipefail

PI_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$PI_ROOT/.." && pwd)
AGENT_DIR=${PI_AGENT_DIR:-"$HOME/.pi/agent"}
SETTINGS="$AGENT_DIR/settings.json"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR="$AGENT_DIR/backups/ripgrim-pi-$STAMP"

command -v pi >/dev/null || { echo "pi is not on PATH" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"
for path in "$SETTINGS" "$AGENT_DIR/AGENTS.md" "$AGENT_DIR/keybindings.json" "$AGENT_DIR/grim-keybindings.json" "$AGENT_DIR/pi-atelier.json"; do
  [[ -f "$path" ]] && cp "$path" "$BACKUP_DIR/"
done
[[ -d "$AGENT_DIR/extensions/powerline-footer" ]] && cp -a "$AGENT_DIR/extensions/powerline-footer" "$BACKUP_DIR/"
[[ -d "$AGENT_DIR/extensions/subagent" ]] && cp -a "$AGENT_DIR/extensions/subagent" "$BACKUP_DIR/"

echo "Installing pinned third-party Pi packages..."
while IFS= read -r source; do
  pi install "$source"
done < <(python3 - "$PI_ROOT/external-packages.json" <<'PY'
import json, sys
for package in json.load(open(sys.argv[1])):
    print(package["source"])
PY
)

echo "Installing personal extension packages..."
for package in "$PI_ROOT"/extensions/*; do
  [[ -f "$package/package.json" ]] && pi install "$package"
done
pi install "$PI_ROOT/skills"

mkdir -p "$AGENT_DIR/extensions/powerline-footer" "$AGENT_DIR/extensions/subagent"
cp "$PI_ROOT/config/keybindings.json" "$AGENT_DIR/keybindings.json"
cp "$PI_ROOT/config/grim-keybindings.json" "$AGENT_DIR/grim-keybindings.json"
cp "$PI_ROOT/config/pi-atelier.json" "$AGENT_DIR/pi-atelier.json"
cp "$PI_ROOT/config/powerline-theme.json" "$AGENT_DIR/extensions/powerline-footer/theme.json"
cp "$PI_ROOT/config/subagent.json" "$AGENT_DIR/extensions/subagent/config.json"
python3 - "$PI_ROOT/config/AGENTS.template.md" "$AGENT_DIR/AGENTS.md" "$REPO_ROOT" <<'PY'
from pathlib import Path
import sys
source, target, repo_root = sys.argv[1:]
Path(target).write_text(Path(source).read_text().replace("__REPO_ROOT__", repo_root))
PY

# Merge safe preferences while preserving credentials, device identity, changelog
# state, sessions, and any unknown machine-local settings.
python3 - "$SETTINGS" "$PI_ROOT/config/settings.template.json" "$REPO_ROOT" <<'PY'
import json, os, sys, tempfile
settings_path, template_path, repo_root = sys.argv[1:]
try:
    with open(settings_path) as f:
        settings = json.load(f)
except FileNotFoundError:
    settings = {}
with open(template_path) as f:
    template = json.load(f)

def expand(value):
    if isinstance(value, str):
        return value.replace("__REPO_ROOT__", repo_root)
    if isinstance(value, list):
        return [expand(item) for item in value]
    if isinstance(value, dict):
        return {key: expand(item) for key, item in value.items()}
    return value

settings.update(expand(template))
os.makedirs(os.path.dirname(settings_path), exist_ok=True)
fd, tmp = tempfile.mkstemp(prefix="settings.", suffix=".json", dir=os.path.dirname(settings_path))
try:
    with os.fdopen(fd, "w") as f:
        json.dump(settings, f, indent=2)
        f.write("\n")
    os.replace(tmp, settings_path)
finally:
    if os.path.exists(tmp): os.unlink(tmp)
PY

chmod 600 "$SETTINGS" "$AGENT_DIR/AGENTS.md" "$AGENT_DIR/grim-keybindings.json" "$AGENT_DIR/pi-atelier.json" 2>/dev/null || true

echo
echo "Pi setup installed. Backup: $BACKUP_DIR"
echo "Run /reload in an existing Pi session."
echo "Pi Remote Control needs a machine-specific config; see pi/config/remote-control.example.json."
