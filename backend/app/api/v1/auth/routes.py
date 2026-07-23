from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Company, Shop
from app.schemas.auth import UserCreate, UserLogin, Token
from app.security import get_password_hash, verify_password, create_access_token
from app.deps import get_current_user
from app.schemas.user import UserWithRole

router = APIRouter()


@router.post("/register", response_model=Token)
def register(body: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    company_id = None
    shop_id = None

    if body.company_name:
        import re
        slug = re.sub(r"[^a-z0-9]+", "-", body.company_name.lower()).strip("-")
        base_slug = slug
        counter = 1
        while db.query(Company).filter(Company.slug == slug).first():
            slug = f"{base_slug}-{counter}"
            counter += 1

        company = Company(name=body.company_name, slug=slug)
        db.add(company)
        db.flush()

        shop = Shop(company_id=company.id, name=f"{body.company_name} - Main", location="")
        db.add(shop)
        db.flush()

        company_id = company.id
        shop_id = shop.id

    user = User(
        email=body.email,
        name=body.name,
        hashed_password=get_password_hash(body.password),
        platform_role="company_admin" if company_id else "user",
        company_id=company_id,
        shop_id=shop_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return Token(access_token=create_access_token(data={"sub": str(user.id)}))


@router.post("/login", response_model=Token)
def login(body: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    return Token(access_token=create_access_token(data={"sub": str(user.id)}))


@router.get("/me", response_model=UserWithRole)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
