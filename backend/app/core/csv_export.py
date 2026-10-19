from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Sequence

from fastapi.responses import StreamingResponse

# A cell starting with one of these is treated as a formula by Excel/Sheets
# (CSV injection). We prefix such cells with an apostrophe so they render as
# literal text instead of executing.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize(value: object) -> str:
    text = "" if value is None else str(value)
    if text and text[0] in _FORMULA_PREFIXES:
        return "'" + text
    return text


def csv_response(
    filename: str,
    header: Sequence[str],
    rows: Iterable[Sequence[object]],
) -> StreamingResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([_sanitize(cell) for cell in row])
    # utf-8-sig: BOM so Excel detects UTF-8 (Arabic/French names) correctly.
    payload = buffer.getvalue().encode("utf-8-sig")
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
