from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload, Query
from app.database import get_db
from app.security import decode_access_token
from app.models import User, Company

security = HTTPBearer()


# --- Current user ---

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    user = (
        db.query(User)
        .options(
            joinedload(User.role),
            joinedload(User.company),
            joinedload(User.shop),
        )
        .filter(User.id == int(user_id))
        .first()
    )

    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    return user


# --- Permission guards ---

def require_permission(permission_id: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.platform_role == "super_admin":
            return current_user

        if current_user.role is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing required permission: {permission_id}")

        user_permission_ids = [p.id for p in current_user.role.permissions]
        if permission_id not in user_permission_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing required permission: {permission_id}")

        return current_user

    return Depends(dependency)


def require_platform_role(*allowed_roles: str):
    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.platform_role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Requires platform role: {', '.join(allowed_roles)}")
        return current_user

    return Depends(dependency)


# --- Tenant helpers ---

def scope_to_company(query: Query, user: User, model_class=None) -> Query:
    if user.platform_role == "super_admin":
        return query
    if user.company_id is None:
        return query.filter(False)
    if model_class is not None:
        col = getattr(model_class, "company_id", None)
        if col is not None:
            return query.filter(col == user.company_id)
    return query


def assert_company_access(user: User, target_company_id: int):
    if user.platform_role == "super_admin":
        return
    if user.company_id != target_company_id:
        raise HTTPException(status_code=403, detail="Access denied to this company")


def get_company_or_404(db: Session, user: User, company_id: int = None):
    target_id = company_id or user.company_id
    if not target_id:
        raise HTTPException(status_code=404, detail="No company assigned")
    company = db.query(Company).filter(Company.id == target_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    assert_company_access(user, company.id)
    return company
