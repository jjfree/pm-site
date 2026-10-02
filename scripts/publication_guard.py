"""Check the actual Git index or history before publishing; never print matches."""

import argparse
import fnmatch
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = [
    ".gitignore",
    ".gitattributes",
    "README.md",
    "LICENSE",
    "pyproject.toml",
    "requirements-lock.txt",
    "app/*.py",
    "app/static/*.html",
    "app/static/assets/*.js",
    "app/static/assets/*.css",
    "frontend/package.json",
    "frontend/pnpm-lock.yaml",
    "frontend/pnpm-workspace.yaml",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "frontend/index.html",
    "frontend/src/*.tsx",
    "frontend/src/*.css",
    "scripts/*.py",
    "scripts/*.ps1",
    "scripts/*.bat",
    "tests/*.py",
    "docs/*.md",
    ".github/workflows/*.yml",
]
PROHIBITED = [
    "data/",
    "private/",
    "backups/",
    "exports/",
    "artifacts/",
    ".venv/",
    "node_modules/",
    "architecture-design-",
    ".private-publication-rules.json",
]
SECRET_PATTERNS = [
    r"gh[pousr]_[A-Za-z0-9]{30,}",
    r"github_pat_[A-Za-z0-9_]{30,}",
    r"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----",
    r"AKIA[0-9A-Z]{16}",
]


def check_blob(path, content, private_terms=()):
    failures = []
    if not any(fnmatch.fnmatchcase(path, p) for p in ALLOWED) or any(p in path for p in PROHIBITED):
        failures.append("path outside public allowlist")
    if b"\0" in content:
        failures.append("binary file is not permitted")
    text = content.decode("utf-8", errors="replace")
    if any(re.search(p, text) for p in SECRET_PATTERNS):
        failures.append("possible credential")
    if any(term and term.casefold() in text.casefold() for term in private_terms):
        failures.append("private publication rule matched")
    return failures


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def scan(history=False):
    rules = ROOT / ".private-publication-rules.json"
    terms = json.loads(rules.read_text(encoding="utf-8")) if rules.exists() else []
    revisions = git("rev-list", "--all").decode().splitlines() if history else [None]
    total, errors = 0, []
    for revision in revisions:
        files = (
            (
                git("ls-tree", "-r", "--name-only", "-z", revision)
                if revision
                else git("ls-files", "--cached", "-z")
            )
            .decode()
            .split("\0")
        )
        for path in filter(None, files):
            content = git("show", f"{revision}:{path}" if revision else f":{path}")
            total += 1
            reasons = check_blob(path, content, terms)
            if reasons:
                # Do not echo source contents or private rule values.
                errors.append(f"{path}: {', '.join(reasons)}")
    print(f"Checked {total} public blobs; violations: {len(errors)}")
    for error in sorted(set(errors)):
        print(error)
    return 1 if errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", action="store_true")
    raise SystemExit(scan(parser.parse_args().history))
