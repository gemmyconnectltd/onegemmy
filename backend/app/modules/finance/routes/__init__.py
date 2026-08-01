from fastapi import APIRouter

from app.modules.finance.routes.account import router as account_router
from app.modules.finance.routes.transaction import router as transaction_router
from app.modules.finance.routes.expense import router as expense_router
from app.modules.finance.routes.budget import router as budget_router

finance_router = APIRouter()
finance_router.include_router(account_router)
finance_router.include_router(transaction_router)
finance_router.include_router(expense_router)
finance_router.include_router(budget_router)
