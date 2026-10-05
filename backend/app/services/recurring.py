"""Recurring ("repeat weekly") orders. Dates and slots are in India time."""
import logging
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from supabase import Client

from app.schemas.orders import OrderCreate
from app.services.notify import notify
from app.services.ordering import place_order

log = logging.getLogger("poshak.recurring")
IST = ZoneInfo("Asia/Kolkata")
INTERVAL_DAYS = {"weekly": 7, "biweekly": 14}
HORIZON_DAYS = 1                       # the order is created the day before pickup
MIN_LEAD = timedelta(minutes=30)       # a pickup that is closer than this can no longer be served


def next_weekday(after: date, weekday: int) -> date:
    """First date strictly after `after` that falls on `weekday` (0 = Monday)."""
    return after + timedelta(days=(weekday - after.weekday() - 1) % 7 + 1)


def advance(d: date, frequency: str) -> date:
    return d + timedelta(days=INTERVAL_DAYS[frequency])


def slot_for(d: date, start_hour: int, end_hour: int) -> tuple[datetime, datetime]:
    return datetime.combine(d, time(start_hour), IST), datetime.combine(d, time(end_hour), IST)


def today_ist(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(IST).date()


def run_due(db: Client, now: datetime | None = None) -> dict[str, int]:
    """Place an order for every active schedule whose pickup is within the horizon.

    Each schedule is *claimed* by moving next_run_date forward with a conditional update before the order
    is placed, so a retried or overlapping cron run cannot create a duplicate."""
    now = now or datetime.now(timezone.utc)
    horizon = today_ist(now) + timedelta(days=HORIZON_DAYS)
    due = db.table("recurring_orders").select("*").eq("status", "active").lte("next_run_date", horizon.isoformat()).execute().data
    out = {"created": 0, "paused": 0, "missed": 0}

    for r in due:
        pickup_day = date.fromisoformat(r["next_run_date"])
        start, end = slot_for(pickup_day, r["slot_start_hour"], r["slot_end_hour"])
        claimed = (
            db.table("recurring_orders").update({"next_run_date": advance(pickup_day, r["frequency"]).isoformat()})
            .eq("id", r["id"]).eq("next_run_date", r["next_run_date"]).eq("status", "active").execute().data
        )
        if not claimed:
            continue  # another run got it
        if start < now + MIN_LEAD:
            db.table("recurring_orders").update({"last_error": f"Missed the pickup on {pickup_day:%d %b}"}).eq("id", r["id"]).execute()
            out["missed"] += 1
            continue
        try:
            order = place_order(db, r["customer_id"], OrderCreate.model_validate({
                "shop_id": r["shop_id"], "address_id": r["address_id"], "payment_method": r["payment_method"],
                "items": r["items"], "pickup_slot_start": start, "pickup_slot_end": end,
            }))
        except HTTPException as e:  # e.g. the laundry removed a service: stop and tell the customer
            db.table("recurring_orders").update({"status": "paused", "last_error": str(e.detail)}).eq("id", r["id"]).execute()
            notify(db, r["customer_id"], "Your repeat order was paused", f"We couldn't schedule it: {e.detail}", None, external=True)
            out["paused"] += 1
            continue
        except Exception:
            log.exception("recurring order %s failed", r["id"])
            db.table("recurring_orders").update({"last_error": "Something went wrong, we'll retry next time"}).eq("id", r["id"]).execute()
            continue
        db.table("recurring_orders").update({"last_order_id": order["id"], "last_error": None}).eq("id", r["id"]).execute()
        out["created"] += 1
    return out
