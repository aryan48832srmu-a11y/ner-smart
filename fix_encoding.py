"""Repair UTF-8 text that was decoded as Windows-1252 (mojibake).

Affected files contain sequences like "â€”" instead of "—". Each mangled
sequence is a multi-byte UTF-8 character whose bytes were mapped through the
Windows-1252 table, so it can be repaired by encoding those characters back to
cp1252 bytes and decoding the result as UTF-8.

The repair walks the text and only consumes characters that form a *complete*
valid multi-byte UTF-8 sequence, so correctly-encoded Unicode text elsewhere in
the same file is left untouched.
"""

from __future__ import annotations

import os
import sys

ROOT = r"D:\SIH project"
EXCLUDE_DIRS = {"node_modules", "venv", ".git", "dist", "__pycache__", ".pytest_cache"}
EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".json", ".md"}


def repair(text: str) -> tuple[str, int]:
    out: list[str] = []
    i = 0
    n = len(text)
    fixed_count = 0
    while i < n:
        ch = text[i]
        code = ord(ch)
        # Lead byte of a multi-byte UTF-8 character, mangled through cp1252.
        if 0xC2 <= code <= 0xF4:
            replaced = False
            for size in (4, 3, 2):
                if i + size > n:
                    continue
                piece = text[i : i + size]
                try:
                    raw = piece.encode("cp1252")
                except UnicodeEncodeError:
                    continue
                try:
                    decoded = raw.decode("utf-8")
                except UnicodeDecodeError:
                    continue
                if len(decoded) == 1:
                    out.append(decoded)
                    i += size
                    fixed_count += 1
                    replaced = True
                    break
            if replaced:
                continue
        out.append(ch)
        i += 1
    return "".join(out), fixed_count


def main() -> int:
    dry = "--dry" in sys.argv
    changed = 0
    total = 0
    scanned = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if os.path.splitext(name)[1].lower() not in EXTS:
                continue
            path = os.path.join(dirpath, name)
            if os.path.abspath(path) == os.path.abspath(__file__):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    text = fh.read()
            except (UnicodeDecodeError, OSError):
                continue
            scanned += 1
            fixed, count = repair(text)
            if count:
                changed += 1
                total += count
                print(f"{'WOULD FIX' if dry else 'fixed'} ({count:3d}) {path}")
                if not dry:
                    with open(path, "w", encoding="utf-8", newline="") as fh:
                        fh.write(fixed)
    print(f"\nScanned {scanned} files, {'would fix' if dry else 'fixed'} {changed} ({total} sequences).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
