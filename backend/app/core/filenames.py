"""File names for every downloaded report and document, so a business can tell its files apart in a downloads folder.

    "<Business> - <Document> - <reference or period> - <generated YYYY-MM-DD HHMM>.<ext>"

Documents that carry their own number (invoice, quotation, purchase order) are already unique and skip the timestamp;
reports are re-generated, so they carry the period and the moment they were made. Characters that file systems refuse
are replaced; the business name is never the software vendor's.
"""
import re
from datetime import UTC, date, datetime
from urllib.parse import quote

_UNSAFE = re.compile(r'[\\/:*?"<>|\r\n\t]+')


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", _UNSAFE.sub("-", str(text))).strip(" .-")


def _day(value) -> str:
    if isinstance(value, datetime | date):
        return value.strftime("%d %b %Y")
    try:
        return date.fromisoformat(str(value)[:10]).strftime("%d %b %Y")
    except ValueError:
        return str(value)


def period_label(start=None, end=None) -> str | None:
    if start and end and str(start)[:10] != str(end)[:10]:
        return f"{_day(start)} to {_day(end)}"
    if end or start:
        return _day(end or start)
    return None


def document_filename(business: str | None, title: str, ext: str, *, reference: str | None = None,
                      period: str | None = None, stamp: bool | None = None) -> str:
    """stamp defaults to True for reports (no reference) and False for numbered documents."""
    parts = [_clean(business or "") or "Business", _clean(title)]
    if reference:
        parts[-1] = f"{parts[-1]} {_clean(reference)}"
    if period:
        parts.append(_clean(period))
    if stamp if stamp is not None else not reference:
        parts.append(datetime.now(UTC).strftime("%Y-%m-%d %H%M"))
    name = " - ".join(p for p in parts if p)[:180]
    return f"{name}.{ext.lstrip('.')}"


def content_disposition(filename: str) -> str:
    """An attachment header that keeps spaces and non-ASCII names intact in every browser."""
    ascii_name = filename.encode("ascii", "ignore").decode() or "download"
    return f"attachment; filename=\"{ascii_name.replace(chr(34), '')}\"; filename*=UTF-8''{quote(filename)}"
