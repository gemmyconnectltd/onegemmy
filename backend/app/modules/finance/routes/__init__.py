from fastapi import APIRouter

from app.modules.finance.routes.account import router as account_router
from app.modules.finance.routes.budget import router as budget_router
from app.modules.finance.routes.expense import router as expense_router
from app.modules.finance.routes.report import router as report_router
from app.modules.finance.routes.tax import router as tax_router
from app.modules.finance.routes.transaction import router as transaction_router

finance_router = APIRouter()
finance_router.include_router(account_router)
finance_router.include_router(transaction_router)
finance_router.include_router(expense_router)
finance_router.include_router(budget_router)
finance_router.include_router(report_router)
finance_router.include_router(tax_router)
