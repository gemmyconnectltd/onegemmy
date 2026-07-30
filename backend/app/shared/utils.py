import re
from datetime import UTC, datetime


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-+", "-", value)
    return value.strip("-")


def _hex_ts() -> str:
    micros = int(datetime.now(UTC).timestamp() * 1_000_000)
    return format(micros, "x")[-8:].upper()


async def unique_slug(prefix: str, exists_fn) -> str:
    prefix = prefix.upper()
    counter = 0
    while True:
        suffix = _hex_ts()
        slug = f"{prefix}-{suffix}" if counter == 0 else f"{prefix}-{suffix}-{counter}"
        if not await exists_fn(slug):
            return slug
        counter += 1
