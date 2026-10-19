from __future__ import annotations


def like_pattern(term: str) -> str:
    """Build a safe ILIKE pattern for user input.

    Escapes backslash, percent and underscore so a literal '%' or '_' typed by
    a user matches itself instead of acting as a wildcard. Callers must pass
    escape="\\\\" to ilike() alongside this pattern.
    """
    escaped = (
        term.strip()
        .replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )
    return f"%{escaped}%"
