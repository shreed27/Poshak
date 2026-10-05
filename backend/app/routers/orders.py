from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.schemas.orders import OrderCreate, OrderStatus, RatingIn
from app.services.dispatch import partner_tracking
from app.services.orders import apply_status, get_order_or_404
from app.services.ordering import place_order
from app.services.photos import attach_photo_urls

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", status_code=201)
def create_order(body: OrderCreate, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    return place_order(db, user.id, body)


@router.get("")
def my_orders(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    return (
        db.table("orders").select("*, shops(name), order_items(*, services(name, unit))").eq("customer_id", user.id)
        .order("created_at", desc=True).execute().data
    )


@router.get("/{order_id}")
def get_order(order_id: str, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    rows = db.table("orders").select(
        "*, shops(name, address), addresses(*), order_items(*, services(name, unit)), order_events(*), order_photos(*)"
    ).eq("id", order_id).execute().data
    if not rows:
        raise HTTPException(404, "Order not found")
    order = rows[0]
    if user.role == "customer" and order["customer_id"] != user.id:
        raise HTTPException(404, "Order not found")
    order["order_events"].sort(key=lambda e: e["created_at"])
    order = attach_photo_urls(db, [order])[0]
    order["partner_tracking"] = partner_tracking(db, order)
    return order


@router.post("/{order_id}/cancel")
def cancel_order(order_id: str, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    if order["customer_id"] != user.id:
        raise HTTPException(404, "Order not found")
    return apply_status(db, order, OrderStatus.CANCELLED, user.id)


@router.post("/{order_id}/rating")
def rate_order(order_id: str, body: RatingIn, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    order = get_order_or_404(db, order_id)
    if order["customer_id"] != user.id:
        raise HTTPException(404, "Order not found")
    if order["status"] != "delivered":
        raise HTTPException(409, "You can rate an order after it is delivered")
    if order["rating"] is not None:
        raise HTTPException(409, "Already rated")
    db.table("orders").update({"rating": body.rating, "review": body.review}).eq("id", order_id).execute()
    rated = db.table("orders").select("rating").eq("shop_id", order["shop_id"]).not_.is_("rating", "null").execute().data
    avg = round(sum(r["rating"] for r in rated) / len(rated), 1)
    db.table("shops").update({"rating": avg}).eq("id", order["shop_id"]).execute()
    return {"rating": body.rating, "shop_rating": avg}
