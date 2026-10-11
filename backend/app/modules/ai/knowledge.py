"""Client help documentation for Pesaa AI: markdown files under ./knowledge, chunked and searched with a
small TF-IDF scorer (stdlib only — no vector database, no network, deterministic and testable).

The docs are the single source for "how do I…" answers. A question that matches nothing returns no
passages, so the assistant says it doesn't know instead of inventing a feature."""
import math
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "knowledge"
_STOP = frozenset(
    ["a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "we", "what", "when", "where", "which", "who", "why", "with", "you", "your", "pesaa", "please", "show", "tell", "give", "about", "get", "use", "using"]
)
_HEADER = re.compile(r"<!--\s*title:\s*(.*?)\s*\|\s*href:\s*(.*?)\s*-->")


@dataclass(frozen=True)
class Passage:
    doc: str
    title: str
    href: str
    text: str


def _tokens(text: str) -> list[str]:
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if w in _STOP or len(w) < 2:
            continue
        # crude stemming so "invoices"/"invoice", "receiving"/"received" meet
        for suf in ("ing", "ed", "es", "s"):
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                w = w[: -len(suf)]
                break
        if w.endswith("e") and len(w) > 3:  # receive / received / receiving → receiv
            w = w[:-1]
        out.append(w)
    return out


@lru_cache(maxsize=1)
def _index() -> tuple[list[Passage], list[list[str]], dict[str, float]]:
    passages: list[Passage] = []
    for path in sorted(DOCS_DIR.glob("*.md")):
        raw = path.read_text(encoding="utf-8")
        m = _HEADER.match(raw)
        title, href = (m.group(1), m.group(2)) if m else (path.stem, "/dashboard")
        body = _HEADER.sub("", raw).strip()
        # paragraphs / bullet groups, merged up to ~700 chars so a passage stays coherent
        buf = ""
        for block in [b.strip() for b in re.split(r"\n\s*\n", body) if b.strip()]:
            if block.startswith("# ") and "\n" not in block:
                continue  # the heading is the title
            if buf and len(buf) + len(block) > 700:
                passages.append(Passage(path.stem, title, href, buf))
                buf = ""
            buf = f"{buf}\n\n{block}".strip()
        if buf:
            passages.append(Passage(path.stem, title, href, buf))
    toks = [_tokens(f"{p.title} {p.text}") for p in passages]
    df: dict[str, int] = {}
    for t in toks:
        for w in set(t):
            df[w] = df.get(w, 0) + 1
    n = len(passages)
    idf = {w: math.log(1 + n / c) for w, c in df.items()}
    return passages, toks, idf


def search(question: str, limit: int = 3, min_score: float = 1.5, min_coverage: float = 0.6) -> list[Passage]:
    """Top passages for a question. A document is only considered if it covers most of the question's
    meaningful words (`min_coverage`): one rare word shared with a page ("Kigali") must not make an
    unrelated question look answered."""
    passages, toks, idf = _index()
    q = set(_tokens(question))
    if not q:
        return []
    doc_terms: dict[str, set[str]] = {}
    for p, t in zip(passages, toks, strict=True):
        doc_terms.setdefault(p.doc, set()).update(t)
    covered = {d for d, terms in doc_terms.items() if len(q & terms) / len(q) >= (min_coverage if len(q) >= 2 else 0)}
    if not covered:
        return []
    scored: list[tuple[float, int]] = []
    for i, t in enumerate(toks):
        if passages[i].doc not in covered:
            continue
        score = sum(idf.get(w, 0) * (1 + math.log(t.count(w))) for w in q if w in t)
        if score >= min_score:
            scored.append((score, i))
    scored.sort(reverse=True)
    out: list[Passage] = []
    seen_docs: dict[str, int] = {}
    for _, i in scored:
        p = passages[i]
        if seen_docs.get(p.doc, 0) >= 2:
            continue
        seen_docs[p.doc] = seen_docs.get(p.doc, 0) + 1
        out.append(p)
        if len(out) >= limit:
            break
    return out
