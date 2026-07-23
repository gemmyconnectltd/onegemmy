from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Lead, Deal, Contact
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.schemas.deal import DealCreate, DealUpdate, DealResponse
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from app.deps import get_current_user, require_permission
from app.models import User

router = APIRouter()


# ── Leads ──────────────────────────────────────────────────────────

@router.get("/leads", response_model=List[LeadResponse])
def list_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("sales.view"),
    db: Session = Depends(get_db),
):
    return db.query(Lead).offset(skip).limit(limit).all()


@router.get("/leads/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    current_user: User = require_permission("sales.view"),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.post("/leads", response_model=LeadResponse)
def create_lead(
    lead: LeadCreate,
    current_user: User = require_permission("sales.leads.manage"),
    db: Session = Depends(get_db),
):
    db_lead = Lead(**lead.model_dump())
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    return db_lead


@router.put("/leads/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: int,
    lead: LeadUpdate,
    current_user: User = require_permission("sales.leads.manage"),
    db: Session = Depends(get_db),
):
    db_lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    for k, v in lead.model_dump(exclude_unset=True).items():
        setattr(db_lead, k, v)
    db.commit()
    db.refresh(db_lead)
    return db_lead


@router.delete("/leads/{lead_id}")
def delete_lead(
    lead_id: int,
    current_user: User = require_permission("sales.leads.manage"),
    db: Session = Depends(get_db),
):
    db_lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not db_lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.delete(db_lead)
    db.commit()
    return {"message": "Lead deleted"}


# ── Deals ──────────────────────────────────────────────────────────

@router.get("/deals", response_model=List[DealResponse])
def list_deals(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("sales.view"),
    db: Session = Depends(get_db),
):
    return db.query(Deal).offset(skip).limit(limit).all()


@router.get("/deals/{deal_id}", response_model=DealResponse)
def get_deal(
    deal_id: int,
    current_user: User = require_permission("sales.view"),
    db: Session = Depends(get_db),
):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return deal


@router.post("/deals", response_model=DealResponse)
def create_deal(
    deal: DealCreate,
    current_user: User = require_permission("sales.create"),
    db: Session = Depends(get_db),
):
    db_deal = Deal(**deal.model_dump(), owner_id=current_user.id)
    db.add(db_deal)
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.put("/deals/{deal_id}", response_model=DealResponse)
def update_deal(
    deal_id: int,
    deal: DealUpdate,
    current_user: User = require_permission("sales.edit"),
    db: Session = Depends(get_db),
):
    db_deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    for k, v in deal.model_dump(exclude_unset=True).items():
        setattr(db_deal, k, v)
    db.commit()
    db.refresh(db_deal)
    return db_deal


@router.delete("/deals/{deal_id}")
def delete_deal(
    deal_id: int,
    current_user: User = require_permission("sales.delete"),
    db: Session = Depends(get_db),
):
    db_deal = db.query(Deal).filter(Deal.id == deal_id).first()
    if not db_deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    db.delete(db_deal)
    db.commit()
    return {"message": "Deal deleted"}


# ── Contacts ───────────────────────────────────────────────────────

@router.get("/contacts", response_model=List[ContactResponse])
def list_contacts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = require_permission("crm.view"),
    db: Session = Depends(get_db),
):
    return db.query(Contact).offset(skip).limit(limit).all()


@router.get("/contacts/{contact_id}", response_model=ContactResponse)
def get_contact(
    contact_id: int,
    current_user: User = require_permission("crm.view"),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact


@router.post("/contacts", response_model=ContactResponse)
def create_contact(
    contact: ContactCreate,
    current_user: User = require_permission("crm.contacts.manage"),
    db: Session = Depends(get_db),
):
    db_contact = Contact(**contact.model_dump())
    db.add(db_contact)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.put("/contacts/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    contact: ContactUpdate,
    current_user: User = require_permission("crm.contacts.manage"),
    db: Session = Depends(get_db),
):
    db_contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for k, v in contact.model_dump(exclude_unset=True).items():
        setattr(db_contact, k, v)
    db.commit()
    db.refresh(db_contact)
    return db_contact


@router.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: int,
    current_user: User = require_permission("crm.contacts.manage"),
    db: Session = Depends(get_db),
):
    db_contact = db.query(Contact).filter(Contact.id == contact_id).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(db_contact)
    db.commit()
    return {"message": "Contact deleted"}
