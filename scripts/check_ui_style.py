"""Keep UI typography and stylesheet sources consistent across the local app."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
STYLES = ROOT / "frontend" / "src" / "styles.css"


def main():
    errors = []
    styles = STYLES.read_text(encoding="utf-8")
    root_block = re.search(r":root\s*\{([^}]*)\}", styles, re.S)
    root_styles = root_block.group(1) if root_block else ""
    if not re.search(
        r'--font-family-ui:\s*Inter,\s*"Segoe UI",\s*"Microsoft JhengHei",\s*sans-serif\s*;',
        root_styles,
    ):
        errors.append("styles.css: keep the shared UI font stack in --font-family-ui")
    if not re.search(r"(?m)^\s*font-family:\s*var\(--font-family-ui\)\s*;", root_styles):
        errors.append("styles.css: :root must apply --font-family-ui")

    for path in (ROOT / "frontend" / "src").rglob("*.css"):
        content = path.read_text(encoding="utf-8")
        declarations = list(re.finditer(r"(?m)^\s*font-family\s*:", content))
        allowed = 1 if path == STYLES else 0
        if len(declarations) != allowed:
            errors.append(f"{path.relative_to(ROOT)}: define font-family only once in styles.css :root")
        if re.search(r"@import\b|@font-face\b|url\(\s*['\"]?https?://", content, re.I):
            errors.append(f"{path.relative_to(ROOT)}: remote or separately loaded styles/fonts are not allowed")

    for path in (ROOT / "frontend" / "src").rglob("*.tsx"):
        if re.search(r"\bfontFamily\s*:", path.read_text(encoding="utf-8")):
            errors.append(f"{path.relative_to(ROOT)}: use inherited typography instead of inline fontFamily")

    for path in (ROOT / "frontend" / "index.html", ROOT / "app" / "static" / "index.html"):
        if re.search(r"<(?:link|script)\b[^>]*(?:href|src)\s*=\s*['\"]https?://", path.read_text(encoding="utf-8"), re.I):
            errors.append(f"{path.relative_to(ROOT)}: use local UI assets")

    if errors:
        for error in errors:
            print(error)
        raise SystemExit(1)
    print("UI style checks passed")


if __name__ == "__main__":
    main()
