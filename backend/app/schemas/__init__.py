from app.schemas.auth import UserCreate, UserLogin, Token, TokenPayload
from app.schemas.user import (
    UserResponse, UserWithRole, UserUpdate, UserInvite, PermissionResponse,
)
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse
from app.schemas.shop import ShopCreate, ShopUpdate, ShopResponse
from app.schemas.role import RoleCreate, RoleUpdate, RoleResponse
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.schemas.deal import DealCreate, DealUpdate, DealResponse
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from app.schemas.transaction import TransactionCreate, TransactionResponse
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.schemas.employee import EmployeeCreate, EmployeeResponse, DashboardStats
from app.schemas.common import PaginatedResponse, MessageResponse, ErrorResponse
