import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.services import razorpay
from app.services.notify import notify
from app.services.orders import get_order_or_404

router = APIRouter(prefix="/payments", tags=["payments"])


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/{order_id}/create")
def create_payment(
    order_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Create a Razorpay order for the final (weighed) bill."""
    order = get_order_or_404(db, order_id)
    if order["customer_id"] != user.id:
        raise HTTPException(404, "Order not found")
    if order["payment_method"] != "online":
        raise HTTPException(409, "This order is cash on delivery")
    if order["payment_status"] == "paid":
        raise HTTPException(409, "Already paid")
    if order["final_amount"] is None:
        raise HTTPException(409, "The final bill is not ready until your clothes are weighed")
    if not settings.razorpay_key_id:
        raise HTTPException(503, "Online payments are not configured")
    try:
        rp = razorpay.create_order(settings.razorpay_key_id, settings.razorpay_key_secret, float(order["final_amount"]), order_id[:40])
    except httpx.HTTPError:
        raise HTTPException(502, "Payment provider error, try again")
    db.table("payments").insert({"order_id": order_id, "razorpay_order_id": rp["id"], "amount": order["final_amount"]}).execute()
    return {"key_id": settings.razorpay_key_id, "razorpay_order_id": rp["id"], "amount": rp["amount"], "currency": "INR"}


@router.post("/verify")
def verify_payment(
    body: VerifyIn,
    user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    pay = db.table("payments").select("*").eq("razorpay_order_id", body.razorpay_order_id).execute().data
    if not pay:
        raise HTTPException(404, "Unknown payment")
    order = get_order_or_404(db, pay[0]["order_id"])
    if order["customer_id"] != user.id:
        raise HTTPException(404, "Unknown payment")
    if not razorpay.verify_signature(settings.razorpay_key_secret, body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        db.table("payments").update({"status": "failed"}).eq("id", pay[0]["id"]).execute()
        raise HTTPException(400, "Invalid payment signature")
    db.table("payments").update({"status": "paid", "razorpay_payment_id": body.razorpay_payment_id}).eq("id", pay[0]["id"]).execute()
    db.table("orders").update({"payment_status": "paid"}).eq("id", order["id"]).execute()
    notify(db, user.id, "Payment received", f"₹{pay[0]['amount']} paid. Thank you!", order["id"])
    return {"payment_status": "paid"}


def _mark_paid(db: Client, razorpay_order_id: str, razorpay_payment_id: str | None) -> None:
    pay = db.table("payments").select("*").eq("razorpay_order_id", razorpay_order_id).execute().data
    if not pay or pay[0]["status"] == "paid":
        return  # unknown order, or the browser callback already recorded it (idempotent)
    db.table("payments").update({"status": "paid", "razorpay_payment_id": razorpay_payment_id}).eq("id", pay[0]["id"]).execute()
    order = get_order_or_404(db, pay[0]["order_id"])
    db.table("orders").update({"payment_status": "paid"}).eq("id", order["id"]).execute()
    notify(db, order["customer_id"], "Payment received", f"\u20b9{pay[0]['amount']} paid. Thank you!", order["id"])


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Client = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Razorpay -> us. Covers the case where the customer pays but closes the browser before our
    verify call. Idempotent, because Razorpay retries deliveries."""
    if not settings.razorpay_webhook_secret:
        raise HTTPException(503, "Webhook is not configured")
    raw = await request.body()
    if not razorpay.verify_webhook_signature(settings.razorpay_webhook_secret, raw, request.headers.get("x-razorpay-signature", "")):
        raise HTTPException(400, "Invalid signature")
    event = json.loads(raw)
    kind, payload = event.get("event"), event.get("payload", {})

    if kind in ("payment.captured", "order.paid"):
        pay = payload.get("payment", {}).get("entity", {})
        if pay.get("order_id"):
            _mark_paid(db, pay["order_id"], pay.get("id"))
    elif kind == "payment.failed":
        pay = payload.get("payment", {}).get("entity", {})
        db.table("payments").update({"status": "failed"}).eq("razorpay_order_id", pay.get("order_id")).neq("status", "paid").execute()
    elif kind in ("refund.processed", "refund.failed"):
        ref = payload.get("refund", {}).get("entity", {})
        db.table("refunds").update({"status": "processed" if kind == "refund.processed" else "failed"}).eq("razorpay_refund_id", ref.get("id")).execute()
    return {"received": True}
