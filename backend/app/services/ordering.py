"""Placing an order. Shared by the customer API and the recurring-order scheduler so both go
through exactly the same validation, pricing, promo, photo and dispatch rules."""
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from supabase import Client

from app.schemas.orders import OrderCreate, OrderStatus
from app.services.dispatch import auto_assign
from app.services.notify import notify
from app.services.orders import get_order_or_404
from app.services.photos import validate_photo_paths
from app.services.pricing import estimate
from app.services.promos import validate_promo


def place_order(db: Client, user_id: str, body: OrderCreate) -> dict:
    if body.pickup_slot_end <= body.pickup_slot_start:
        raise HTTPException(422, "Pickup slot end must be after start")
    if body.pickup_slot_start < datetime.now(timezone.utc):
        raise HTTPException(422, "Pickup slot is in the past")
    photo_paths = validate_photo_paths(body.photo_paths, user_id)
    addr = db.table("addresses").select("id").eq("id", body.address_id).eq("user_id", user_id).execute().data
    if not addr:
        raise HTTPException(422, "Unknown address")

    ids = [i.service_id for i in body.items]
    services = db.table("services").select("id, price").eq("shop_id", body.shop_id).eq("is_active", True).in_("id", ids).execute().data
    prices = {s["id"]: s["price"] for s in services}
    if len(prices) != len(set(ids)):
        raise HTTPException(422, "Unknown service for this shop")

    lines = [{"unit_price": prices[i.service_id], "quantity": i.quantity} for i in body.items]
    subtotal = estimate(lines)
    promo, discount = (validate_promo(db, body.promo_code, user_id, subtotal) if body.promo_code else (None, 0))
    order = db.table("orders").insert({
        "customer_id": user_id,
        "shop_id": body.shop_id,
        "address_id": body.address_id,
        "pickup_slot_start": body.pickup_slot_start.isoformat(),
        "pickup_slot_end": body.pickup_slot_end.isoformat(),
        "estimated_amount": float(subtotal - discount),  # what the customer expects to pay
        "discount_amount": float(discount),
        "promo_code": promo["code"] if promo else None,
        "promo_kind": promo["kind"] if promo else None,
        "promo_value": promo["value"] if promo else None,
        "promo_max_discount": promo["max_discount"] if promo else None,
        "payment_method": body.payment_method,
        "status": OrderStatus.PLACED.value,
    }).execute().data[0]
    db.table("order_items").insert([
        {"order_id": order["id"], "service_id": i.service_id, "quantity": i.quantity, "unit_price": prices[i.service_id]}
        for i in body.items
    ]).execute()
    if photo_paths:
        db.table("order_photos").insert([{"order_id": order["id"], "path": p} for p in photo_paths]).execute()
    db.table("order_events").insert({"order_id": order["id"], "status": "placed", "actor_id": user_id}).execute()
    notify(db, user_id, "Order placed", "We're finding a pickup partner.", order["id"])
    try:
        auto_assign(db, order)
    except Exception:  # dispatch is best-effort; the order stays open for partners to accept
        logging.getLogger("poshak.dispatch").exception("auto-assign failed for order %s", order["id"])
    return get_order_or_404(db, order["id"])
