from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.core.response import success_response

router = APIRouter(tags=["Currencies"])

# Single source of truth for supported currencies — the frontend/mobile apps
# fetch this instead of hardcoding their own copy, so adding a currency here
# is the only change needed to offer it everywhere.
SUPPORTED_CURRENCIES = [
    {"code": "RWF", "symbol": "RWF", "name": "Rwandan Franc"},
    {"code": "USD", "symbol": "$", "name": "US Dollar"},
    {"code": "EUR", "symbol": "€", "name": "Euro"},
    {"code": "KES", "symbol": "KSh", "name": "Kenyan Shilling"},
    {"code": "UGX", "symbol": "USh", "name": "Ugandan Shilling"},
    {"code": "TZS", "symbol": "TSh", "name": "Tanzanian Shilling"},
]


@router.get("/currencies")
async def list_currencies(current_user: CurrentUser):
    return success_response(data=SUPPORTED_CURRENCIES, message="Currencies retrieved successfully")
