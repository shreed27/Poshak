from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.schemas.orders import OrderCreate, OrderStatus, RatingIn
from app.services.notify import notify
from app.services.orders import apply_status, get_order_or_404
from app.services.photos import attach_photo_urls, validate_photo_paths
from app.services.pricing import estimate

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", status_code=201)
def create_order(body: OrderCreate, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    if body.pickup_slot_end <= body.pickup_slot_start:
        raise HTTPException(422, "Pickup slot end must be after start")
    if body.pickup_slot_start < datetime.now(timezone.utc):
        raise HTTPException(422, "Pickup slot is in the past")
    photo_paths = validate_photo_paths(body.photo_paths, user.id)
    addr = db.table("addresses").select("id").eq("id", body.address_id).eq("user_id", user.id).execute().data
    if not addr:
        raise HTTPException(422, "Unknown address")

    ids = [i.service_id for i in body.items]
    services = db.table("services").select("id, price").eq("shop_id", body.shop_id).eq("is_active", True).in_("id", ids).execute().data
    prices = {s["id"]: s["price"] for s in services}
    if len(prices) != len(set(ids)):
        raise HTTPException(422, "Unknown service for this shop")

    lines = [{"unit_price": prices[i.service_id], "quantity": i.quantity} for i in body.items]
    order = db.table("orders").insert({
        "customer_id": user.id,
        "shop_id": body.shop_id,
        "address_id": body.address_id,
        "pickup_slot_start": body.pickup_slot_start.isoformat(),
        "pickup_slot_end": body.pickup_slot_end.isoformat(),
        "estimated_amount": float(estimate(lines)),
        "payment_method": body.payment_method,
        "status": OrderStatus.PLACED.value,
    }).execute().data[0]
    db.table("order_items").insert([
        {"order_id": order["id"], "service_id": i.service_id, "quantity": i.quantity, "unit_price": prices[i.service_id]}
        for i in body.items
    ]).execute()
    if photo_paths:
        db.table("order_photos").insert([{"order_id": order["id"], "path": p} for p in photo_paths]).execute()
    db.table("order_events").insert({"order_id": order["id"], "status": "placed", "actor_id": user.id}).execute()
    notify(db, user.id, "Order placed", "We're finding a pickup partner.", order["id"])
    return order


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
    return attach_photo_urls(db, [order])[0]


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
