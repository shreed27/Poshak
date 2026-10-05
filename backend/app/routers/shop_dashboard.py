from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client

from app.auth import CurrentUser, require_role
from app.db import get_db
from app.permissions import role_can_set
from app.schemas.orders import StatusUpdate
from app.services.orders import apply_status, get_order_or_404, owned_shop_ids
from app.services.photos import attach_photo_urls

router = APIRouter(prefix="/shop", tags=["shop dashboard"])
shop_only = require_role("shop", "admin")


def _shop_ids(db: Client, user: CurrentUser) -> list[str]:
    ids = owned_shop_ids(db, user.id)
    if not ids and user.role != "admin":
        raise HTTPException(404, "No shop is linked to your account")
    return ids


@router.get("/me")
def my_shop(user: CurrentUser = Depends(shop_only), db: Client = Depends(get_db)):
    ids = _shop_ids(db, user)
    return db.table("shops").select("*, services(*)").in_("id", ids).execute().data


@router.get("/orders")
def shop_orders(user: CurrentUser = Depends(shop_only), db: Client = Depends(get_db)):
    ids = _shop_ids(db, user)
    q = db.table("orders").select("*, order_items(*, services(name, unit)), order_photos(*)").order("created_at", desc=True)
    if user.role != "admin":
        q = q.in_("shop_id", ids)
    return attach_photo_urls(db, q.execute().data)


@router.post("/orders/{order_id}/status")
def set_status(order_id: str, body: StatusUpdate, user: CurrentUser = Depends(shop_only), db: Client = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    if user.role != "admin" and order["shop_id"] not in _shop_ids(db, user):
        raise HTTPException(403, "Not your shop's order")
    if not role_can_set(user.role, body.status):
        raise HTTPException(403, f"Shops cannot set status {body.status.value}")
    return apply_status(db, order, body.status, user.id)


class ServiceIn(BaseModel):
    shop_id: str
    name: str
    unit: Literal["kg", "piece"]
    price: Decimal = Field(ge=0)
    turnaround_hours: int = Field(default=48, ge=1)


class ServiceUpdate(BaseModel):
    name: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    turnaround_hours: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


@router.post("/services", status_code=201)
def add_service(body: ServiceIn, user: CurrentUser = Depends(shop_only), db: Client = Depends(get_db)):
    if user.role != "admin" and body.shop_id not in _shop_ids(db, user):
        raise HTTPException(403, "Not your shop")
    data = body.model_dump(mode="json")
    return db.table("services").insert(data).execute().data[0]


@router.patch("/services/{service_id}")
def update_service(service_id: str, body: ServiceUpdate, user: CurrentUser = Depends(shop_only), db: Client = Depends(get_db)):
    rows = db.table("services").select("shop_id").eq("id", service_id).execute().data
    if not rows:
        raise HTTPException(404, "Service not found")
    if user.role != "admin" and rows[0]["shop_id"] not in _shop_ids(db, user):
        raise HTTPException(403, "Not your shop")
    changes = body.model_dump(mode="json", exclude_none=True)
    if not changes:
        raise HTTPException(422, "Nothing to update")
    return db.table("services").update(changes).eq("id", service_id).execute().data[0]
