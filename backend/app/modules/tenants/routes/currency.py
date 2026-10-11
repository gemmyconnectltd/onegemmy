from fastapi import APIRouter

from app.core.currency_data import CURRENCY_DATA
from app.core.deps import CurrentUser, DbSession
from app.core.response import success_response
from app.modules.currency import service as currency_service

router = APIRouter(tags=["Currencies"])

# Single source of truth for supported currencies is app.core.currency_data (ISO 4217 code, name,
# symbol and decimal places); the `currencies` table carries the runtime active flag. The frontend and
# mobile apps fetch /global/currencies instead of keeping their own copy. `SUPPORTED_CURRENCIES` stays
# as a derived constant for the callers that only need the codes (registration validation, public stats).
SUPPORTED_CURRENCIES = [
    {"code": code, "symbol": symbol, "name": name, "decimal_places": places}
    for code, name, symbol, places in CURRENCY_DATA
]


@router.get("/currencies")
async def list_currencies(db: DbSession, current_user: CurrentUser):
    rows = await currency_service.list_currencies(db, active_only=True)
    data = (
        [{"code": r.code, "symbol": r.symbol, "name": r.name, "decimal_places": r.decimal_places} for r in rows]
        if rows else SUPPORTED_CURRENCIES  # table not seeded yet
    )
    return success_response(data=data, message="Currencies retrieved successfully")
