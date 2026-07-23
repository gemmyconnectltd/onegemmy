from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.config import settings
from app.core.database import engine, Base, get_db
from app.models.models import User, Product, Lead, Deal, Contact, Transaction, Project, Employee
from app.schemas.schemas import DashboardStats
from app.api import auth, products, leads, deals, contacts, transactions, projects
from app.core.security import get_password_hash

app = FastAPI(
    title="OneGemmy API",
    description="All-in-One Business Management Platform API by Gemmy Connect Ltd",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables
Base.metadata.create_all(bind=engine)


@app.on_event("startup")
def seed_admin():
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@onegemmy.com").first()
        if not admin:
            admin = User(
                email="admin@onegemmy.com",
                name="Admin",
                hashed_password=get_password_hash("admin123"),
                role="admin",
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()


# Register routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(leads.router, prefix="/api/leads", tags=["Leads"])
app.include_router(deals.router, prefix="/api/deals", tags=["Deals"])
app.include_router(contacts.router, prefix="/api/contacts", tags=["Contacts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["Transactions"])
app.include_router(projects.router, prefix="/api/projects", tags=["Projects"])


@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "OneGemmy", "version": "1.0.0"}


@app.get("/api/dashboard", response_model=DashboardStats)
def get_dashboard(db: Session = Depends(get_db)):
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
