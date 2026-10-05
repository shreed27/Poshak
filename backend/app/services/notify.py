import logging

from supabase import Client

from app.services import channels

log = logging.getLogger("poshak.notify")

STATUS_MESSAGES = {
    "pickup_assigned": ("Pickup scheduled", "A partner has been assigned to collect your clothes."),
    "picked_up": ("Clothes picked up", "We have your clothes and are heading to the shop."),
    "weighed": ("Clothes weighed", "Your final bill is ready."),
    "washing": ("Washing started", "Your clothes are being cleaned."),
    "ready": ("Clothes are ready", "Your order will be out for delivery shortly."),
    "out_for_delivery": ("Out for delivery", "Your partner is on the way."),
    "delivered": ("Delivered", "Enjoy your fresh clothes! Rate your order."),
    "cancelled": ("Order cancelled", "Your order was cancelled."),
}


# Statuses worth interrupting someone for outside the app (the rest stay in-app only, to limit SMS/WhatsApp cost).
EXTERNAL_STATUSES = {"pickup_assigned", "weighed", "out_for_delivery", "delivered", "cancelled"}


def notify(db: Client, user_id: str, title: str, body: str | None = None, order_id: str | None = None, external: bool = False) -> None:
    """Store an in-app notification and, when `external`, also push / WhatsApp / SMS it per the user's settings."""
    db.table("notifications").insert(
        {"user_id": user_id, "order_id": order_id, "title": title, "body": body}
    ).execute()
    log.info("notify user=%s title=%s", user_id, title)
    if external:
        try:
            channels.deliver(db, user_id, title, body, order_id)
        except Exception:  # never let a messaging problem break the action that triggered it
            log.exception("external delivery failed for user %s", user_id)


def notify_status(db: Client, order: dict, status: str) -> None:
    if status in STATUS_MESSAGES:
        title, body = STATUS_MESSAGES[status]
        notify(db, order["customer_id"], title, body, order["id"], external=status in EXTERNAL_STATUSES)
