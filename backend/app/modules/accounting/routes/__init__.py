from fastapi import APIRouter

from app.modules.accounting.routes.account import router as account_router
from app.modules.accounting.routes.budget import router as budget_router
from app.modules.accounting.routes.expense import router as expense_router
from app.modules.accounting.routes.report import router as report_router
from app.modules.accounting.routes.tax import router as tax_router
from app.modules.accounting.routes.transaction import router as transaction_router

accounting_router = APIRouter()
accounting_router.include_router(account_router)
accounting_router.include_router(transaction_router)
accounting_router.include_router(expense_router)
accounting_router.include_router(budget_router)
accounting_router.include_router(report_router)
accounting_router.include_router(tax_router)
