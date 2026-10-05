from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from supabase import Client


def _d(x) -> Decimal:
    return Decimal(str(x))


def compute_discount(kind: str, value, max_discount, subtotal) -> Decimal:
    """Discount for `subtotal`, never more than the subtotal itself."""
    sub = _d(subtotal)
    if kind == "percent":
        d = sub * _d(value) / 100
        if max_discount is not None:
            d = min(d, _d(max_discount))
    else:
        d = _d(value)
    return max(Decimal(0), min(d, sub)).quantize(Decimal("0.01"))


def _parse(ts: str | None) -> datetime | None:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")) if ts else None


def validate_promo(db: Client, code: str, user_id: str, subtotal) -> tuple[dict, Decimal]:
    """Return (promo row, discount) or raise 422 with a customer-friendly reason."""
    rows = db.table("promo_codes").select("*").eq("code", code.strip().upper()).execute().data
    promo = rows[0] if rows else None
    if not promo or not promo["is_active"]:
        raise HTTPException(422, "This promo code is not valid")
    now = datetime.now(timezone.utc)
    if (s := _parse(promo.get("starts_at"))) and now < s:
        raise HTTPException(422, "This promo code is not active yet")
    if (e := _parse(promo.get("ends_at"))) and now > e:
        raise HTTPException(422, "This promo code has expired")
    if _d(subtotal) < _d(promo["min_order"]):
        raise HTTPException(422, f"Add items worth ₹{promo['min_order']} or more to use this code")

    used = db.table("orders").select("customer_id").eq("promo_code", promo["code"]).neq("status", "cancelled").execute().data
    if promo.get("usage_limit") is not None and len(used) >= promo["usage_limit"]:
        raise HTTPException(422, "This promo code has been fully redeemed")
    if sum(1 for o in used if o["customer_id"] == user_id) >= promo["per_user_limit"]:
        raise HTTPException(422, "You have already used this promo code")
    if promo["first_order_only"]:
        prior = db.table("orders").select("id").eq("customer_id", user_id).neq("status", "cancelled").execute().data
        if prior:
            raise HTTPException(422, "This promo code is only for your first order")

    discount = compute_discount(promo["kind"], promo["value"], promo.get("max_discount"), subtotal)
    if discount <= 0:
        raise HTTPException(422, "This promo code gives no discount on this order")
    return promo, discount
