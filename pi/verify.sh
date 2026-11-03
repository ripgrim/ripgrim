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
    assert (package / "README.md").is_file()
    for entry in manifest["pi"]["extensions"]:
        assert (package / entry).is_file(), (package, entry)
print("manifests: ok")
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
