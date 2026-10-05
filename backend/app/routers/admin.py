from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal
from supabase import Client

from app.auth import CurrentUser, require_role
from app.db import get_db
from app.services.orders import apply_status, get_order_or_404
from app.schemas.orders import OrderStatus

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_role("admin")


@router.get("/stats")
def stats(user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    orders = db.table("orders").select("status, final_amount, estimated_amount").execute().data
    by_status: dict[str, int] = {}
    for o in orders:
        by_status[o["status"]] = by_status.get(o["status"], 0) + 1
    revenue = sum(float(o["final_amount"] or o["estimated_amount"]) for o in orders if o["status"] == "delivered")
    users = db.table("profiles").select("role").execute().data
    roles: dict[str, int] = {}
    for u in users:
        roles[u["role"]] = roles.get(u["role"], 0) + 1
    return {"orders": len(orders), "by_status": by_status, "revenue": round(revenue, 2), "users_by_role": roles}


@router.get("/orders")
def all_orders(user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    return db.table("orders").select("*, shops(name)").order("created_at", desc=True).limit(200).execute().data


@router.get("/users")
def users(user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    return db.table("profiles").select("*").order("created_at", desc=True).limit(200).execute().data


class RoleIn(BaseModel):
    role: Literal["customer", "partner", "shop", "admin"]


@router.patch("/users/{user_id}/role")
def set_role(user_id: str, body: RoleIn, user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    if user_id == user.id and body.role != "admin":
        raise HTTPException(409, "You cannot remove your own admin role")
    rows = db.table("profiles").update({"role": body.role}).eq("id", user_id).execute().data
    if not rows:
        raise HTTPException(404, "User not found")
    return rows[0]


class ShopIn(BaseModel):
    name: str
    description: str | None = None
    address: str | None = None
    city: str
    owner_id: str | None = None


class ShopPatch(BaseModel):
    is_active: bool | None = None
    owner_id: str | None = None
    name: str | None = None


@router.get("/shops")
def all_shops(user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    return db.table("shops").select("*").order("created_at", desc=True).execute().data


@router.post("/shops", status_code=201)
def create_shop(body: ShopIn, user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    shop = db.table("shops").insert(body.model_dump()).execute().data[0]
    if body.owner_id:
        db.table("profiles").update({"role": "shop"}).eq("id", body.owner_id).execute()
    return shop


@router.patch("/shops/{shop_id}")
def patch_shop(shop_id: str, body: ShopPatch, user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(422, "Nothing to update")
    rows = db.table("shops").update(changes).eq("id", shop_id).execute().data
    if not rows:
        raise HTTPException(404, "Shop not found")
    if body.owner_id:
        db.table("profiles").update({"role": "shop"}).eq("id", body.owner_id).execute()
    return rows[0]


class AssignIn(BaseModel):
    partner_id: str


@router.post("/orders/{order_id}/assign")
def assign_partner(order_id: str, body: AssignIn, user: CurrentUser = Depends(admin_only), db: Client = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    p = db.table("profiles").select("role").eq("id", body.partner_id).execute().data
    if not p or p[0]["role"] != "partner":
        raise HTTPException(422, "That user is not a partner")
    db.table("orders").update({"partner_id": body.partner_id}).eq("id", order_id).execute()
    order["partner_id"] = body.partner_id
    return apply_status(db, order, OrderStatus.PICKUP_ASSIGNED, user.id)
