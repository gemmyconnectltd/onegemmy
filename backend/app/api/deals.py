from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.models import Deal
from app.schemas.schemas import DealCreate, DealUpdate, DealResponse

router = APIRouter()


@router.get("/", response_model=List[DealResponse])
def get_deals(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    deals = db.query(Deal).offset(skip).limit(limit).all()
    return deals


@router.get("/{deal_id}", response_model=DealResponse)
def get_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/", response_model=DealResponse)
def create_deal(deal: DealCreate, db: Session = Depends(get_db)):
    db_deal = Deal(**deal.model_dump())
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.put("/{deal_id}", response_model=DealResponse)
def update_deal(deal_id: int, deal: DealUpdate, db: Session = Depends(get_db)):
    db_deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    update_data = deal.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_deal, key, value)

    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.delete("/{deal_id}")
def delete_deal(deal_id: int, db: Session = Depends(get_db)):
    db_deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    db.delete(db_deal)
    db.commit()
    return {"message": "Deal deleted"}
