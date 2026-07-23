from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.deps import get_current_user
from app.models import User, Product, Contact, Deal, Transaction, Project, Employee
from app.schemas.employee import DashboardStats

router = APIRouter()


@router.get("/", response_model=DashboardStats)
def get_dashboard(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_revenue = db.query(func.coalesce(func.sum(Transaction.amount), 0)).filter(Transaction.type == "income").scalar()
    total_expenses = db.query(func.coalesce(func.abs(func.sum(Transaction.amount)), 0)).filter(Transaction.type == "expense").scalar()
    total_products = db.query(func.count(Product.id)).scalar()
    total_contacts = db.query(func.count(Contact.id)).scalar()
    total_deals = db.query(func.count(Deal.id)).scalar()
    total_employees = db.query(func.count(Employee.id)).scalar()

    return DashboardStats(
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        net_profit=total_revenue - total_expenses,
        total_products=total_products,
        total_contacts=total_contacts,
        total_deals=total_deals,
        total_employees=total_employees,
    )
