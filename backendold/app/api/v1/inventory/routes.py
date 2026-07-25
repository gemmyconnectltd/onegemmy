from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Product, User
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.deps import require_permission

router = APIRouter()


@router.get("/", response_model=List[ProductResponse])
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("stock.view"),
    db: Session = Depends(get_db),
):
    return db.query(Product).filter(Product.is_active == True).offset(skip).limit(limit).all()


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(
    product_id: int,
    current_user: User = require_permission("stock.view"),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("/", response_model=ProductResponse)
def create_product(
    product: ProductCreate,
    current_user: User = require_permission("stock.create"),
    db: Session = Depends(get_db),
):
    if db.query(Product).filter(Product.sku == product.sku).first():
        raise HTTPException(status_code=400, detail="SKU already exists")
    db_product = Product(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product: ProductUpdate,
    current_user: User = require_permission("stock.edit"),
    db: Session = Depends(get_db),
):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    for k, v in product.model_dump(exclude_unset=True).items():
        setattr(db_product, k, v)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.delete("/{product_id}")
def delete_product(
    product_id: int,
    current_user: User = require_permission("stock.delete"),
    db: Session = Depends(get_db),
):
    db_product = db.query(Product).filter(Product.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Product not found")
    db_product.is_active = False
    db.commit()
    return {"message": "Product deleted"}
