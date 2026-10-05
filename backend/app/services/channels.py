"""Outbound notification channels: SMS + WhatsApp (Twilio) and browser push (Web Push / VAPID).

Every channel is optional and best-effort: unconfigured channels are skipped, and a failure in one
never affects the others or the order update that triggered the message."""
import json
import logging

import httpx
from supabase import Client

from app.config import Settings, get_settings

log = logging.getLogger("poshak.channels")
TIMEOUT = 4  # seconds; sends are synchronous, so keep them short


def twilio_ready(s: Settings) -> bool:
    return bool(s.twilio_account_sid and s.twilio_auth_token)


def push_ready(s: Settings) -> bool:
    return bool(s.vapid_public_key and s.vapid_private_key)


def _twilio_send(s: Settings, from_: str, to: str, body: str) -> None:
    res = httpx.post(
        f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json",
        auth=(s.twilio_account_sid, s.twilio_auth_token),
        data={"From": from_, "To": to, "Body": body},
        timeout=TIMEOUT,
    )
    res.raise_for_status()


def send_sms(s: Settings, phone: str, text: str) -> None:
    _twilio_send(s, s.twilio_sms_from, phone, text)


def send_whatsapp(s: Settings, phone: str, text: str) -> None:
    # NOTE: outside the 24h customer-service window WhatsApp requires pre-approved templates in production.
    _twilio_send(s, s.twilio_whatsapp_from, f"whatsapp:{phone}", text)


def send_push(s: Settings, db: Client, subs: list[dict], title: str, body: str | None, url: str) -> None:
    from pywebpush import WebPushException, webpush  # imported lazily so the app starts without it

    payload = json.dumps({"title": title, "body": body or "", "url": url})
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                data=payload, vapid_private_key=s.vapid_private_key, vapid_claims={"sub": s.vapid_subject}, ttl=3600, timeout=TIMEOUT,
            )
        except WebPushException as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if status in (404, 410):  # subscription expired or revoked: forget it
                db.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
            else:
                log.warning("web push failed (%s): %s", status, e)


def deliver(db: Client, user_id: str, title: str, body: str | None, order_id: str | None, settings: Settings | None = None) -> list[str]:
    """Fan a notification out to the user's enabled channels. Returns the channels that were attempted."""
    s = settings or get_settings()
    prof = db.table("profiles").select("*").eq("id", user_id).execute().data
    if not prof:
        return []
    prefs, phone = prof[0], prof[0].get("phone")
    text = f"Poshak: {title}" + (f". {body}" if body else "")
    url = f"/orders/{order_id}" if order_id else "/"
    attempted: list[str] = []

    def attempt(name: str, fn) -> None:
        attempted.append(name)
        try:
            fn()
        except Exception:
            log.exception("%s notification failed for user %s", name, user_id)

    if prefs.get("notify_push", True) and push_ready(s):
        subs = db.table("push_subscriptions").select("*").eq("user_id", user_id).execute().data
        if subs:
            attempt("push", lambda: send_push(s, db, subs, title, body, url))
    if phone and twilio_ready(s):
        if prefs.get("notify_whatsapp", True) and s.twilio_whatsapp_from:
            attempt("whatsapp", lambda: send_whatsapp(s, phone, text))
        if prefs.get("notify_sms", False) and s.twilio_sms_from:
            attempt("sms", lambda: send_sms(s, phone, text))
    return attempted
