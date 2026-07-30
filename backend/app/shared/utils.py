import re
import uuid


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^\w\s-]", "", value)
    value = re.sub(r"[\s_]+", "-", value)
    value = re.sub(r"-+", "-", value)
    return value.strip("-")


def unique_slug(base: str, exists_fn) -> str:
    slug = slugify(base)
    candidate = slug
    while exists_fn(candidate):
        candidate = f"{slug}-{uuid.uuid4().hex[:4]}"
    return candidate
