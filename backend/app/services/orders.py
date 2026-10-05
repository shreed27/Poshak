from fastapi import HTTPException
from supabase import Client

from app.schemas.orders import OrderStatus, can_transition
from app.services.notify import notify_status


def get_order_or_404(db: Client, order_id: str) -> dict:
    rows = db.table("orders").select("*").eq("id", order_id).execute().data
    if not rows:
        raise HTTPException(404, "Order not found")
    return rows[0]


def apply_status(db: Client, order: dict, new: OrderStatus, actor_id: str, extra: dict | None = None) -> dict:
    """Validate the transition, persist it, log an event and notify the customer."""
    current = OrderStatus(order["status"])
    if not can_transition(current, new):
        raise HTTPException(409, f"Cannot move from {current.value} to {new.value}")
    fields = {"status": new.value, **(extra or {})}
    if new == OrderStatus.DELIVERED and order["payment_method"] == "cod":
        fields["payment_status"] = "paid"
    updated = db.table("orders").update(fields).eq("id", order["id"]).eq("status", current.value).execute().data
    if not updated:
        raise HTTPException(409, "Order was updated by someone else, refresh and retry")
    db.table("order_events").insert({"order_id": order["id"], "status": new.value, "actor_id": actor_id}).execute()
    notify_status(db, order, new.value)
    return updated[0]


def owned_shop_ids(db: Client, user_id: str) -> list[str]:
    return [s["id"] for s in db.table("shops").select("id").eq("owner_id", user_id).execute().data]
