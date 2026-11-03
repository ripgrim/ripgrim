#!/usr/bin/env bash
set -euo pipefail
PI_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

python3 - "$PI_ROOT" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
for path in root.rglob("*.json"):
    json.load(open(path))
for package in (root / "extensions").iterdir():
    if not package.is_dir(): continue
    manifest = json.load(open(package / "package.json"))
    assert manifest["name"].startswith("@ripgrim/pi-")
    readme = package / "README.md"
    screenshot = package / "assets" / "screenshot.png"
    assert readme.is_file()
    assert screenshot.is_file() and screenshot.read_bytes().startswith(b"\x89PNG\r\n\x1a\n")
    assert "./assets/screenshot.png" in readme.read_text()
    for entry in manifest["pi"]["extensions"]:
        assert (package / entry).is_file(), (package, entry)
root_manifest = json.load(open(root.parent / "package.json"))
for entry in root_manifest["pi"]["extensions"] + root_manifest["pi"]["skills"]:
    assert (root.parent / entry).exists(), entry
print("manifests and README attachments: ok")
PY

for test in "$PI_ROOT"/extensions/*/*.test.ts; do
  node --experimental-strip-types --test "$test"
done

extension_args=()
for package in "$PI_ROOT"/extensions/*; do
  extension_args+=(--extension "$package")
done
pi --no-extensions --no-skills --no-prompt-templates --no-themes \
  "${extension_args[@]}" --list-models >/dev/null
printf 'extension load smoke test: ok\n'
pi --no-extensions --no-skills --no-prompt-templates --no-themes \
  --extension "$PI_ROOT/.." --list-models >/dev/null
printf 'repository-root Git package smoke test: ok\n'

python3 - "$PI_ROOT" <<'PY'
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
blocked_names = {"auth.json", "models-store.json"}
patterns = [
    re.compile(r"BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY"),
    re.compile(r'"deviceId"\s*:'),
    re.compile(r'"(?:apiKey|accessToken|refreshToken)"\s*:\s*"(?!YOUR-|\$|<)[^"\n]{12,}"'),
]
findings = []
for path in root.rglob("*"):
    if not path.is_file() or "vendor" in path.parts:
        continue
    if path.name in blocked_names:
        findings.append(f"blocked file: {path}")
        continue
    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue
    for pattern in patterns:
        if pattern.search(text):
            findings.append(f"secret-like content: {path} ({pattern.pattern})")
if findings:
    raise SystemExit("\n".join(findings))
print("secret scan: ok")
PY

echo "pi setup verification passed"
