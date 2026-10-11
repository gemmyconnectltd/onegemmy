"""AI provider abstraction. The engine talks only to `AIProvider`; nothing else in Pesaa knows which
vendor (or the offline mock) answers. Adding a provider = one class here + one branch in `get_provider`.

Providers never see tenant ids, branch ids or credentials of any kind: they receive the conversation and
the *names/schemas* of tools they may call, nothing more.
"""
import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import settings

# A short rate-limit wait is absorbed inside the request; longer ones are reported to the user instead.
MAX_RETRY_WAIT_SECONDS = 20.0


class ProviderError(Exception):
    """The provider could not answer (timeout, 5xx, bad key, malformed reply). Safe to show a summary of."""


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any] | str  # raw: the model may send malformed JSON — validated by the engine


@dataclass
class ChatMessage:
    role: str  # system | user | assistant | tool
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_call_id: str | None = None


@dataclass
class ProviderResult:
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    model: str = ""


class AIProvider(Protocol):
    name: str
    model: str

    async def complete(self, messages: list[ChatMessage], tools: list[ToolSpec], *, max_tokens: int) -> ProviderResult: ...


# ── Offline mock ──────────────────────────────────────────────────────────────

_PERIODS = [
    (r"\btoday\b", "today"),
    (r"last (7|seven) days|this week|past week", "last_7_days"),
    (r"last month|previous month", "last_month"),
    (r"this month", "this_month"),
    (r"last (90|ninety) days|quarter|3 months", "last_90_days"),
]
# (keywords, tool) — first match wins; order matters (more specific first).
_INTENTS: list[tuple[str, str]] = [
    (r"\bwho\b.*\b(am i|logged|signed)\b|who is me|my (name|role)|which (branch|business|company)|what branch|am i logged|where am i", "about_me"),
    (r"most expensive|highest price|cheapest|lowest price|most stock|least stock|price of|cost of|list (my |all )?products|how much .* (do we|we) have", "find_products"),
    (r"list (my |all )?(customers|clients)|customer (called|named)|has .* bought", "find_customers"),
    (r"(who are|list) (my |our )?suppliers|supplier (called|named)", "find_suppliers"),
    (r"how many orders|pending orders|cancel+ed orders|orders (today|this)", "orders_overview"),
    (r"how many (products?|items?|customers?|clients?|suppliers?|vendors?|employees?|staff|workers?)|number of (products|customers|suppliers|employees)", "how_many"),
    (r"how is my business|business doing|business performing|how am i doing|check.?up", "business_overview"),
    (r"profit|margin|earn(ed|ings)", "profit_summary"),
    (r"compare|versus|\bvs\b", "compare_sales"),
    (r"trend|over time", "revenue_trend"),
    (r"inventory value|stock value|worth of (my )?(stock|inventory)|value of (my )?(stock|inventory)", "inventory_value"),
    (r"slow(ly)?[ -]?(moving|selling)|not selling|dead stock", "slow_moving_products"),
    (r"new customers?", "new_customers"),
    (r"(which )?suppliers? .*(most|buy from|purchase from)|buy from most|purchase from most", "supplier_spend"),
    (r"unpaid (supplier )?bills?|purchases? .*unpaid|unpaid purchases?", "unpaid_bills"),
    (r"unpaid invoices?|which invoices", "unpaid_invoices"),
    (r"not (purchased|bought|ordered)|haven'?t (purchased|bought|ordered)|inactive customer|no recent purchase|stopped buying", "inactive_customers"),
    (r"top customers?|best customers?|biggest customers?|who (buys|spends) the most", "top_customers"),
    (r"owe (my )?suppliers?|supplier bills?|payables?|what do i owe|accounts payable", "payables"),
    (r"reorder|re-order|restock|how much (should i|to) (order|buy)", "reorder_recommendations"),
    (r"low.?stock|running low|stock ?out|out of stock|inventory level", "low_stock"),
    (r"receivable|owe me|owes? me|outstanding|overdue|debt|unpaid|who owes", "receivables"),
    (r"expense|spending|cost increase|spent", "expenses_summary"),
    (r"purchase order|purchases|buying|supplier spend", "purchases_summary"),
    (r"production|work order|manufactur", "production_status"),
    (r"workforce|attendance|leave|headcount|employees?|staff", "workforce_summary"),
    (r"top|best|highest|popular|best.?sell|which products|product", "top_products"),
    (r"sale|sell|sold|revenue|turnover|invoice", "sales_summary"),
]
_SMALL_TALK = re.compile(r"(hi|hey|hello|hallo|yo|good (morning|afternoon|evening)|thanks|thank you|ok|okay|cool|great)[\s!.,?]*(pesaa( ai)?)?[\s!.?]*")


def is_small_talk(text: str) -> bool:
    """Greetings and thanks need no business lookup — the assistant skips the lookups entirely (saves time and tokens)."""
    return bool(_SMALL_TALK.fullmatch(text.strip().lower()))


_HELP = r"^(how (do|can|to|does|should)|what (is|does)\b(?! (my|the (most|least|cheapest|highest|lowest|price|total|number|best|top|average)))|what can|where (do|can)|explain|help|guide|tell me about|can pesaa)"
_NUMBER_WORDS = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}


def _period_from(text: str) -> str:
    for pat, name in _PERIODS:
        if re.search(pat, text):
            return name
    return "last_30_days"


def _parse_items(text: str) -> list[dict[str, Any]]:
    """"two laptops and one printer" -> [{product_name: "laptops", quantity: 2}, ...]."""
    items = []
    for part in re.split(r",|\band\b", text):
        m = re.match(r"\s*(\d+(?:\.\d+)?|" + "|".join(_NUMBER_WORDS) + r")?\s*(.+?)\s*$", part.strip(" .?!"), re.IGNORECASE)
        if not m or not m.group(2):
            continue
        q = m.group(1)
        qty = float(q) if q and q[0].isdigit() else float(_NUMBER_WORDS.get((q or "one").lower(), 1))
        items.append({"product_name": m.group(2), "quantity": qty})
    return items


class MockProvider:
    """Deterministic, free, offline. It picks a tool from keywords and then answers *only* with what the
    tool returned (each tool result carries a ready-made `headline`). It can't hallucinate — which also
    makes it the right fallback when a real provider is down."""

    name = "mock"
    model = "pesaa-mock-1"

    async def complete(self, messages: list[ChatMessage], tools: list[ToolSpec], *, max_tokens: int) -> ProviderResult:
        last_user = next((i for i in range(len(messages) - 1, -1, -1) if messages[i].role == "user"), -1)
        tool_msgs = [m for m in messages[last_user + 1:] if m.role == "tool"]
        if tool_msgs:
            return ProviderResult(text=compose_from_tool_messages(tool_msgs), model=self.model)

        raw = messages[last_user].content if last_user >= 0 else ""
        question = raw.lower().strip()
        available = {t.name for t in tools}

        def call(name: str, args: dict[str, Any]) -> ProviderResult:
            return ProviderResult(tool_calls=[ToolCall("mock-1", name, args)], model=self.model)

        if is_small_talk(question):
            return ProviderResult(text=(
                "Hello! I'm Pesaa AI, your business assistant. Ask me about your sales, stock, customers, supplier bills or expenses, "
                "or how to do something in Pesaa. For example: \"How much did I sell last month?\" or \"Which products are running low?\""), model=self.model)
        m = re.search(r"(?:draft|create|prepare|make|raise)\b.*?\binvoice for (.+?) (?:with|containing|for|of) (.+)$", raw, re.IGNORECASE)
        if m and "draft_invoice" in available:
            return call("draft_invoice", {"customer_name": m.group(1).strip(), "items": _parse_items(m.group(2))})
        if re.search(r"(draft|create|prepare|make|raise)\b.*purchase order", question) and "draft_purchase_order" in available:
            days = re.search(r"within (\d+) days", question)
            sup = re.search(r"purchase order (?:to|for supplier) ([a-z0-9 .&'-]+?)(?: for| with|$)", raw, re.IGNORECASE)
            pargs: dict[str, Any] = {"from_reorder_days": int(days.group(1)) if days else 14}
            if sup:
                pargs["supplier_name"] = sup.group(1).strip()
            return call("draft_purchase_order", pargs)
        rem = re.search(r"remind(?:er)?\b.*?(?:to|for|of)\s+(.+?)(?:\s+(?:about|to pay|of|for)\b.*)?[.?!]*$", raw, re.IGNORECASE)
        if rem and "draft_payment_reminder" in available and re.search(r"(draft|send|prepare|write|create|payment reminder|remind)", question):
            return call("draft_payment_reminder", {"customer_name": rem.group(1).strip()})
        if re.search(r"\b(human|real person|talk to (a |an )?(person|someone|agent)|speak to|whatsapp|customer support|support team)\b", question) and "help_docs" in available:
            return call("help_docs", {"question": raw[:300]})
        if re.match(_HELP, question) and "help_docs" in available:
            return call("help_docs", {"question": raw[:300]})
        go = re.match(r"^(?:please )?(?:open|go to|take me to|navigate to|bring up|show me)\s+(?:the |my )?(.+?)(?: page| module| screen)?[.!?]*$", question)
        if go and "navigate" in available:
            from app.modules.ai.tools_nav import DESTINATIONS

            want = go.group(1).strip()
            best = max(DESTINATIONS.values(), key=lambda d: (want == d.label.lower(), want in (d.key.replace("_", " "), d.label.lower()), -len(d.label)), default=None)
            if best and want in (best.key.replace("_", " "), best.label.lower(), best.label.lower().rstrip("s"), best.key.rstrip("s")):
                return call("navigate", {"destination": best.key})
        for pat, tool in _INTENTS:
            if tool in available and re.search(pat, question):
                args: dict[str, Any] = {}
                if tool in ("sales_summary", "top_products", "expenses_summary", "top_customers", "purchases_summary", "workforce_summary",
                            "profit_summary", "revenue_trend", "new_customers", "supplier_spend", "business_overview"):
                    args["period"] = _period_from(question)
                if tool == "find_products":
                    sort = ("highest_price" if re.search(r"most expensive|highest price", question) else "lowest_price" if re.search(r"cheapest|lowest price", question)
                            else "most_stock" if "most stock" in question else "least_stock" if "least stock" in question else "name")
                    named = re.search(r"(?:price|cost) of (?:the |a |an )?(.+?)[?.!]*$", question)
                    args = {"sort": sort, **({"search": named.group(1)[:80]} if named and sort == "name" else {})}
                if tool == "orders_overview":
                    args["period"] = _period_from(question)
                if tool == "how_many":
                    w = re.search(r"product|item|customer|client|supplier|vendor|employee|staff|worker", question)
                    args["what"] = {"product": "products", "item": "products", "customer": "customers", "client": "customers", "supplier": "suppliers",
                                    "vendor": "suppliers"}.get(w.group(0) if w else "", "employees" if w else "products")
                if tool == "inactive_customers":
                    d = re.search(r"(\d+) days", question)
                    args["days"] = max(7, min(365, int(d.group(1)))) if d else 60
                return call(tool, args)
        if "help_docs" in available:
            return call("help_docs", {"question": raw[:300]})
        return ProviderResult(
            text=("I can answer questions about your sales, products, stock, customers, supplier bills, expenses and more "
                  "using your real Pesaa data, and explain how Pesaa works. Try one of the suggested questions, or ask for example "
                  "\"How much did I sell last month?\""),
            model=self.model,
        )


def compose_from_tool_messages(tool_msgs: list[ChatMessage]) -> str:
    """Join the deterministic headlines of tool results into an answer; surfaces tool errors honestly."""
    lines: list[str] = []
    for m in tool_msgs:
        try:
            data = json.loads(m.content)
        except (TypeError, ValueError):
            continue
        if isinstance(data, dict):
            lines.append(str(data.get("headline") or data.get("error") or ""))
    return "\n".join(line for line in lines if line) or "I couldn't find anything to answer that."


def recover_text_tool_calls(text: str, known: set[str]) -> tuple[list[ToolCall], str | None]:
    """If a model answered with a tool call written as text (`{"name": "open_customers", "parameters": {}}`, optionally
    in a code fence or a list), turn it into a real call; the raw JSON must never reach the user. Returns (calls, text)
    — text is None when it was only a call. Unknown tool names are dropped (and the stray JSON with them)."""
    s = text.strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s).strip()
    if not s or s[0] not in "{[":
        return [], text
    try:
        data = json.loads(s)
    except ValueError:
        return [], text
    items = data if isinstance(data, list) else [data]
    calls: list[ToolCall] = []
    for i, it in enumerate(items):
        if not isinstance(it, dict):
            return [], text
        fn = it.get("function") if isinstance(it.get("function"), dict) else it
        name = fn.get("name")
        args = fn.get("parameters", fn.get("arguments", {}))
        if not isinstance(name, str):
            return [], text
        if name in known:
            calls.append(ToolCall(f"text-{i}", name, json.dumps(args) if not isinstance(args, str) else args))
    return calls, None


# ── OpenAI (chat completions + tools) ─────────────────────────────────────────

class OpenAIProvider:
    """OpenAI chat completions + tools. Any OpenAI-compatible service (e.g. Groq) is this class with a
    different `name`, base URL, model and key."""

    name = "openai"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float, name: str = "openai",
                 extra_body: dict[str, Any] | None = None) -> None:
        self._key, self.model, self._base, self._timeout, self.name = api_key, model, base_url.rstrip("/"), timeout, name
        self._extra = extra_body or {}

    @staticmethod
    def _to_wire(m: ChatMessage) -> dict[str, Any]:
        if m.role == "tool":
            return {"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content}
        out: dict[str, Any] = {"role": m.role, "content": m.content or None}
        if m.tool_calls:
            out["tool_calls"] = [{
                "id": c.id, "type": "function",
                "function": {"name": c.name, "arguments": c.arguments if isinstance(c.arguments, str) else json.dumps(c.arguments)},
            } for c in m.tool_calls]
        return out

    async def _post(self, body: dict[str, Any]) -> httpx.Response:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                return await client.post(f"{self._base}/chat/completions", json=body, headers={"Authorization": f"Bearer {self._key}"})
        except httpx.TimeoutException as exc:
            raise ProviderError("Pesaa AI took too long to reply") from exc
        except httpx.HTTPError as exc:
            raise ProviderError("Could not reach Pesaa AI") from exc

    @staticmethod
    def _is_credit_error(resp: httpx.Response) -> bool:
        try:
            return str((resp.json().get("error") or {}).get("code") or "") in ("insufficient_quota", "credit_balance_exhausted")
        except ValueError:
            return False

    async def complete(self, messages: list[ChatMessage], tools: list[ToolSpec], *, max_tokens: int) -> ProviderResult:
        body: dict[str, Any] = {
            "model": self.model, "messages": [self._to_wire(m) for m in messages],
            "max_tokens": max_tokens, "temperature": 0.2,
        }
        body.update(self._extra)
        if tools:
            body["tools"] = [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.parameters}} for t in tools]
            body["tool_choice"] = "auto"
        resp = await self._post(body)
        for _ in range(2):  # rate limit (tokens/minute on small plans): wait the provider's own short hint, up to twice
            if resp.status_code != 429 or self._is_credit_error(resp):
                break
            try:
                wait = float(resp.headers.get("retry-after", "0"))
            except ValueError:
                wait = 0.0
            if not 0 < wait <= MAX_RETRY_WAIT_SECONDS:
                break
            await asyncio.sleep(wait)
            resp = await self._post(body)
        if resp.status_code >= 400:
            # Never echo the response body (it can contain request fragments). Only the error's *code* is read,
            # to turn the two account-level problems an admin must act on into a clear, fixed message.
            try:
                code = str((resp.json().get("error") or {}).get("code") or "")
            except ValueError:
                code = ""
            if resp.status_code == 401:
                raise ProviderError(f"The AI provider rejected the API key (check the {self.name.upper()} API key)")
            if resp.status_code == 429 and code in ("rate_limit_exceeded", "rate_limit_reached"):
                raise ProviderError("The AI provider's rate limit was reached; try again shortly")
            if code in ("insufficient_quota", "credit_balance_exhausted"):
                raise ProviderError("The AI provider account has no credit left (add billing credit in the provider dashboard)")
            raise ProviderError(f"The AI provider returned an error ({resp.status_code})")
        try:
            data = resp.json()
            msg = data["choices"][0]["message"]
            usage = data.get("usage") or {}
            calls = [ToolCall(c["id"], c["function"]["name"], c["function"].get("arguments") or "{}") for c in (msg.get("tool_calls") or [])]
            text = msg.get("content")
            if not calls and text:
                # Small local models sometimes write the call as plain text instead of using the tool channel.
                calls, text = recover_text_tool_calls(text, {t.name for t in tools})
            return ProviderResult(
                text=text, tool_calls=calls, model=data.get("model", self.model),
                prompt_tokens=int(usage.get("prompt_tokens", 0)), completion_tokens=int(usage.get("completion_tokens", 0)),
            )
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise ProviderError("The AI provider sent an unreadable reply") from exc


def get_provider() -> AIProvider:
    """Configured provider. `openai` without a key falls back to the mock rather than failing every
    request — the status endpoint reports which one is really in use."""
    if settings.AI_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        return OpenAIProvider(settings.OPENAI_API_KEY, settings.AI_MODEL, settings.OPENAI_BASE_URL, settings.AI_TIMEOUT_SECONDS)
    if settings.AI_PROVIDER == "groq" and settings.GROQ_API_KEY:
        # gpt-oss models "think" before answering and those tokens count against max_tokens: keep it short.
        extra = {"reasoning_effort": "low"} if "gpt-oss" in settings.GROQ_MODEL else None
        return OpenAIProvider(settings.GROQ_API_KEY, settings.GROQ_MODEL, settings.GROQ_BASE_URL, settings.AI_TIMEOUT_SECONDS, name="groq", extra_body=extra)
    if settings.AI_PROVIDER == "ollama":
        return OpenAIProvider("ollama", settings.OLLAMA_MODEL, settings.OLLAMA_BASE_URL, settings.OLLAMA_TIMEOUT_SECONDS, name="ollama")
    return MockProvider()
