from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List
from app.database import get_db
from app.models import User, Company, Shop, Role, Permission
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse
from app.schemas.shop import ShopCreate, ShopUpdate, ShopResponse
from app.schemas.user import UserResponse, UserInvite, UserUpdate, UserWithRole, PermissionResponse
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse
from app.security import get_password_hash
from app.deps import get_current_user, require_permission, require_platform_role

router = APIRouter()


# ── Companies ──────────────────────────────────────────────────────

@router.get("/companies", response_model=List[CompanyResponse])
def list_companies(
    current_user: User = require_platform_role("super_admin"),
    db: Session = Depends(get_db),
):
    return db.query(Company).all()


@router.post("/companies", response_model=CompanyResponse)
def create_company(
    body: CompanyCreate,
    current_user: User = require_platform_role("super_admin"),
    db: Session = Depends(get_db),
):
    if db.query(Company).filter(Company.slug == body.slug).first():
        raise HTTPException(status_code=400, detail="Company slug already taken")
    company = Company(**body.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return company


@router.get("/companies/me", response_model=CompanyResponse)
def get_my_company(
    current_user: User = require_platform_role("company_admin", "super_admin"),
    db: Session = Depends(get_db),
):
    if not current_user.company_id:
        raise HTTPException(status_code=404, detail="No company assigned")
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.get("/companies/{company_id}", response_model=CompanyResponse)
def get_company(
    company_id: int,
    current_user: User = require_platform_role("super_admin"),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.put("/companies/{company_id}", response_model=CompanyResponse)
def update_company(
    company_id: int,
    body: CompanyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    if current_user.platform_role != "super_admin" and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if body.name is not None:
        company.name = body.name
    if body.plan is not None:
        company.plan = body.plan
    if body.is_active is not None:
        company.is_active = body.is_active

    db.commit()
    db.refresh(company)
    return company


@router.delete("/companies/{company_id}")
def delete_company(
    company_id: int,
    current_user: User = require_platform_role("super_admin"),
    db: Session = Depends(get_db),
):
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
    return {"message": "Company deleted"}


# ── Shops ──────────────────────────────────────────────────────────

@router.get("/shops", response_model=List[ShopResponse])
def list_shops(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.platform_role == "super_admin":
        return db.query(Shop).all()
    if not current_user.company_id:
        return []
    return db.query(Shop).filter(Shop.company_id == current_user.company_id).all()


@router.post("/shops", response_model=ShopResponse)
def create_shop(
    body: ShopCreate,
    current_user: User = require_permission("settings.company"),
    db: Session = Depends(get_db),
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="No company assigned")
    shop = Shop(company_id=current_user.company_id, name=body.name, location=body.location)
    db.add(shop)
    db.commit()
    db.refresh(shop)
    return shop


@router.get("/shops/{shop_id}", response_model=ShopResponse)
def get_shop(
    shop_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if current_user.platform_role != "super_admin" and shop.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return shop


@router.put("/shops/{shop_id}", response_model=ShopResponse)
def update_shop(
    shop_id: int,
    body: ShopUpdate,
    current_user: User = require_permission("settings.company"),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if current_user.platform_role != "super_admin" and shop.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(shop, k, v)
    db.commit()
    db.refresh(shop)
    return shop


@router.delete("/shops/{shop_id}")
def delete_shop(
    shop_id: int,
    current_user: User = require_permission("settings.company"),
    db: Session = Depends(get_db),
):
    shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if current_user.platform_role != "super_admin" and shop.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.delete(shop)
    db.commit()
    return {"message": "Shop deleted"}


# ── Users ──────────────────────────────────────────────────────────

@router.get("/users", response_model=List[UserWithRole])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("settings.users.manage"),
    db: Session = Depends(get_db),
):
    query = db.query(User).options(
        joinedload(User.role), joinedload(User.company), joinedload(User.shop),
    )
    if current_user.platform_role == "super_admin":
        pass
    elif current_user.platform_role == "company_admin" and current_user.company_id:
        query = query.filter(User.company_id == current_user.company_id)
    else:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return query.offset(skip).limit(limit).all()


@router.post("/users", response_model=UserResponse)
def invite_user(
    body: UserInvite,
    current_user: User = require_permission("settings.users.manage"),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    import secrets
    company_id = current_user.company_id
    if current_user.platform_role == "super_admin" and body.company_id:
        company_id = body.company_id

    user = User(
        email=body.email, name=body.name,
        hashed_password=get_password_hash(secrets.token_urlsafe(12)),
        platform_role=body.platform_role or "user",
        role_id=body.role_id, company_id=company_id, shop_id=body.shop_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/{user_id}", response_model=UserWithRole)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).options(
        joinedload(User.role), joinedload(User.company), joinedload(User.shop),
    ).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.id != user_id:
        if current_user.platform_role == "super_admin":
            pass
        elif current_user.platform_role == "company_admin" and user.company_id == current_user.company_id:
            pass
        else:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: User = require_permission("settings.users.manage"),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current_user.platform_role == "company_admin" and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot edit users from other companies")

    if body.name is not None:
        user.name = body.name
    if body.platform_role is not None:
        if body.platform_role in ("super_admin", "company_admin") and current_user.platform_role != "super_admin":
            raise HTTPException(status_code=403, detail="Only super admins can assign admin roles")
        user.platform_role = body.platform_role
    if body.role_id is not None:
        user.role_id = body.role_id
    if body.company_id is not None and current_user.platform_role == "super_admin":
        user.company_id = body.company_id
    if body.shop_id is not None:
        user.shop_id = body.shop_id
    if body.is_active is not None:
        if user.id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot deactivate yourself")
        user.is_active = body.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: User = require_permission("settings.users.manage"),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if current_user.platform_role != "super_admin" and user.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot delete users from other companies")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}


# ── Roles ──────────────────────────────────────────────────────────

@router.get("/roles/permissions", response_model=List[PermissionResponse])
def list_permissions(
    current_user: User = require_permission("settings.roles.manage"),
    db: Session = Depends(get_db),
):
    return db.query(Permission).all()


@router.get("/roles", response_model=List[RoleResponse])
def list_roles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("settings.view"),
    db: Session = Depends(get_db),
):
    query = db.query(Role)
    if current_user.platform_role != "super_admin":
        query = query.filter((Role.company_id == None) | (Role.company_id == current_user.company_id))
    return query.offset(skip).limit(limit).all()


@router.post("/roles", response_model=RoleResponse)
def create_role(
    body: RoleCreate,
    current_user: User = require_permission("settings.roles.manage"),
    db: Session = Depends(get_db),
):
    company_id = current_user.company_id
    if db.query(Role).filter(Role.name == body.name, Role.company_id == company_id).first():
        raise HTTPException(status_code=400, detail="Role with this name already exists")

    role = Role(company_id=company_id, name=body.name, description=body.description, color=body.color)
    if body.permissions:
        role.permissions = db.query(Permission).filter(Permission.id.in_(body.permissions)).all()
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@router.get("/roles/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: int,
    current_user: User = require_permission("settings.view"),
    db: Session = Depends(get_db),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.put("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int,
    body: RoleUpdate,
    current_user: User = require_permission("settings.roles.manage"),
    db: Session = Depends(get_db),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot edit system roles")
    if current_user.platform_role != "super_admin" and role.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot edit roles from other companies")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.color is not None:
        role.color = body.color
    if body.permissions is not None:
        role.permissions = db.query(Permission).filter(Permission.id.in_(body.permissions)).all()
    db.commit()
    db.refresh(role)
    return role


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int,
    current_user: User = require_permission("settings.roles.manage"),
    db: Session = Depends(get_db),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")
    if current_user.platform_role != "super_admin" and role.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Cannot delete roles from other companies")
    if db.query(User).filter(User.role_id == role_id).count() > 0:
        raise HTTPException(status_code=400, detail="Cannot delete: users are assigned to this role")
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}
