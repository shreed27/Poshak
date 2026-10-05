from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.db import get_db

router = APIRouter(prefix="/shops", tags=["shops"])


@router.get("")
def list_shops(db: Client = Depends(get_db)):
    shops = db.table("shops").select("*, services(*)").eq("is_active", True).execute().data
    for shop in shops:  # only show services the shop currently offers
        shop["services"] = [s for s in shop["services"] if s["is_active"]]
    return shops


@router.get("/{shop_id}/services")
def shop_services(shop_id: str, db: Client = Depends(get_db)):
    res = db.table("services").select("*").eq("shop_id", shop_id).eq("is_active", True).execute()
    if not res.data:
        raise HTTPException(404, "No services found")
    return res.data
