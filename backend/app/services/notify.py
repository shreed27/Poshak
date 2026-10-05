import logging

from supabase import Client

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


def notify(db: Client, user_id: str, title: str, body: str | None = None, order_id: str | None = None) -> None:
    """Store an in-app notification. Push / WhatsApp / SMS senders hook in here."""
    db.table("notifications").insert(
        {"user_id": user_id, "order_id": order_id, "title": title, "body": body}
    ).execute()
    log.info("notify user=%s title=%s", user_id, title)


def notify_status(db: Client, order: dict, status: str) -> None:
    if status in STATUS_MESSAGES:
        title, body = STATUS_MESSAGES[status]
        notify(db, order["customer_id"], title, body, order["id"])
