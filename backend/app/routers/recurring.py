import hmac
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.schemas.orders import OrderItemIn
from app.services.recurring import next_weekday, run_due, today_ist

router = APIRouter(tags=["recurring"])
MAX_ACTIVE = 5


class RecurringIn(BaseModel):
    shop_id: str
    address_id: str
    items: list[OrderItemIn] = Field(min_length=1, max_length=20)
    payment_method: Literal["online", "cod"] = "cod"
    frequency: Literal["weekly", "biweekly"] = "weekly"
    weekday: int | None = Field(default=None, ge=0, le=6, description="0 = Monday")
    first_pickup: date | None = None
    slot_start_hour: int = Field(ge=6, le=21)
    slot_end_hour: int = Field(ge=7, le=22)

    @model_validator(mode="after")
    def _check(self):
        if self.slot_end_hour <= self.slot_start_hour:
            raise ValueError("slot_end_hour must be after slot_start_hour")
        if self.weekday is None and self.first_pickup is None:
            raise ValueError("Provide weekday or first_pickup")
        return self


class StatusPatch(BaseModel):
    status: Literal["active", "paused", "cancelled"]


@router.get("/recurring")
def list_schedules(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    return (
        db.table("recurring_orders").select("*, shops(name)").eq("customer_id", user.id)
        .neq("status", "cancelled").order("created_at", desc=True).execute().data
    )


@router.post("/recurring", status_code=201)
def create_schedule(body: RecurringIn, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    if not db.table("addresses").select("id").eq("id", body.address_id).eq("user_id", user.id).execute().data:
        raise HTTPException(422, "Unknown address")
    ids = list({i.service_id for i in body.items})
    found = db.table("services").select("id").eq("shop_id", body.shop_id).eq("is_active", True).in_("id", ids).execute().data
    if len(found) != len(ids):
        raise HTTPException(422, "Unknown service for this shop")
    active = db.table("recurring_orders").select("id").eq("customer_id", user.id).eq("status", "active").execute().data
    if len(active) >= MAX_ACTIVE:
        raise HTTPException(409, f"You can have up to {MAX_ACTIVE} active repeat orders")

    today = today_ist()
    first = body.first_pickup
    if first is not None and first <= today:
        raise HTTPException(422, "The first pickup must be after today")
    weekday = first.weekday() if first else body.weekday
    first = first or next_weekday(today, weekday)
    return db.table("recurring_orders").insert({
        "customer_id": user.id, "shop_id": body.shop_id, "address_id": body.address_id,
        "items": [{"service_id": i.service_id, "quantity": i.quantity} for i in body.items],
        "payment_method": body.payment_method, "frequency": body.frequency, "weekday": weekday,
        "slot_start_hour": body.slot_start_hour, "slot_end_hour": body.slot_end_hour,
        "next_run_date": first.isoformat(), "status": "active",
    }).execute().data[0]


@router.patch("/recurring/{schedule_id}")
def update_schedule(schedule_id: str, body: StatusPatch, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    rows = db.table("recurring_orders").select("*").eq("id", schedule_id).eq("customer_id", user.id).execute().data
    if not rows:
        raise HTTPException(404, "Repeat order not found")
    row = rows[0]
    if row["status"] == "cancelled":
        raise HTTPException(409, "A cancelled repeat order can't be changed")
    changes: dict = {"status": body.status}
    if body.status == "active":
        changes["last_error"] = None
        if date.fromisoformat(row["next_run_date"]) <= today_ist():  # resumed after its date passed: pick the next occurrence
            changes["next_run_date"] = next_weekday(today_ist(), row["weekday"]).isoformat()
    return db.table("recurring_orders").update(changes).eq("id", schedule_id).execute().data[0]


@router.api_route("/cron/recurring", methods=["GET", "POST"], include_in_schema=False)
def cron_recurring(authorization: str | None = Header(default=None), db: Client = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Called daily by Vercel Cron (GET with `Authorization: Bearer $CRON_SECRET`)."""
    if not settings.cron_secret:
        raise HTTPException(503, "Cron is not configured")
    if not hmac.compare_digest((authorization or "").encode(), f"Bearer {settings.cron_secret}".encode()):
        raise HTTPException(401, "Unauthorized")
    return run_due(db)
