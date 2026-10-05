from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.db import get_db

router = APIRouter(tags=["me"])


class ProfileUpdate(BaseModel):
    full_name: str


@router.get("/me")
def me(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    rows = db.table("profiles").select("*").eq("id", user.id).execute().data
    return rows[0] if rows else {"id": user.id, "phone": user.phone, "role": user.role, "full_name": None}


@router.patch("/me")
def update_me(body: ProfileUpdate, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    rows = db.table("profiles").upsert({"id": user.id, "phone": user.phone, "full_name": body.full_name}).execute().data
    return rows[0]


class AddressIn(BaseModel):
    label: str | None = None
    line1: str
    line2: str | None = None
    city: str
    pincode: str
    lat: float | None = None
    lng: float | None = None


@router.get("/addresses")
def list_addresses(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    return db.table("addresses").select("*").eq("user_id", user.id).order("created_at").execute().data


@router.post("/addresses", status_code=201)
def add_address(body: AddressIn, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    return db.table("addresses").insert({**body.model_dump(), "user_id": user.id}).execute().data[0]


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: str, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    res = db.table("addresses").delete().eq("id", address_id).eq("user_id", user.id).execute()
    if not res.data:
        raise HTTPException(404, "Address not found")
