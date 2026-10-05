from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.auth import CurrentUser, require_role
from app.db import get_db
from app.schemas.orders import OrderStatus, StatusUpdate, WeighIn
from app.permissions import role_can_set
from app.services.notify import notify, notify_status
from app.services.orders import apply_status, get_order_or_404
from app.services.photos import attach_photo_urls
from app.services.pricing import final_amount
from app.services.promos import compute_discount

router = APIRouter(prefix="/partner", tags=["partner"])
partner_only = require_role("partner", "admin")

ORDER_SELECT = "*, shops(name, address), addresses(*), order_photos(*)"


@router.get("/available")
def available(user: CurrentUser = Depends(partner_only), db: Client = Depends(get_db)):
    rows = (
        db.table("orders").select(ORDER_SELECT).eq("status", "placed").is_("partner_id", "null")
        .order("pickup_slot_start").execute().data
    )
    return attach_photo_urls(db, rows)


@router.get("/mine")
def mine(user: CurrentUser = Depends(partner_only), db: Client = Depends(get_db)):
    rows = (
        db.table("orders").select(ORDER_SELECT).eq("partner_id", user.id)
        .not_.in_("status", ["delivered", "cancelled"]).order("pickup_slot_start").execute().data
    )
    return attach_photo_urls(db, rows)


@router.post("/orders/{order_id}/accept")
def accept(order_id: str, user: CurrentUser = Depends(partner_only), db: Client = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    if order["status"] != "placed" or order["partner_id"]:
        raise HTTPException(409, "Order is no longer available")
    # Conditional update so two partners cannot both claim the same order.
    claimed = (
        db.table("orders").update({"partner_id": user.id}).eq("id", order_id)
        .is_("partner_id", "null").eq("status", "placed").execute().data
    )
    if not claimed:
        raise HTTPException(409, "Another partner just took this order")
    return apply_status(db, claimed[0], OrderStatus.PICKUP_ASSIGNED, user.id)


def _own_order(db: Client, order_id: str, user: CurrentUser) -> dict:
    order = get_order_or_404(db, order_id)
    if user.role != "admin" and order["partner_id"] != user.id:
        raise HTTPException(403, "This order is not assigned to you")
    return order


@router.post("/orders/{order_id}/weigh")
def weigh(order_id: str, body: WeighIn, user: CurrentUser = Depends(partner_only), db: Client = Depends(get_db)):
    """Record the weight at pickup, compute the final bill and move picked_up -> weighed."""
    order = _own_order(db, order_id, user)
    if order["status"] != "picked_up":
        raise HTTPException(409, "Mark the order as picked up before weighing")
    lines = db.table("order_items").select("quantity, unit_price, services(unit)").eq("order_id", order_id).execute().data
    flat = [{"quantity": l["quantity"], "unit_price": l["unit_price"], "unit": l["services"]["unit"]} for l in lines]
    gross = final_amount(flat, body.weight_kg)
    discount = compute_discount(order["promo_kind"], order["promo_value"], order["promo_max_discount"], gross) if order.get("promo_code") else 0
    return apply_status(db, order, OrderStatus.WEIGHED, user.id, {
        "weight_kg": body.weight_kg, "final_amount": float(gross - discount), "discount_amount": float(discount),
    })


@router.post("/orders/{order_id}/status")
def set_status(order_id: str, body: StatusUpdate, user: CurrentUser = Depends(partner_only), db: Client = Depends(get_db)):
    if not role_can_set(user.role, body.status):
        raise HTTPException(403, f"Partners cannot set status {body.status.value}")
    return apply_status(db, _own_order(db, order_id, user), body.status, user.id)
