import json
from types import SimpleNamespace

import httpx
import pytest
from pywebpush import WebPushException

from app.config import Settings, get_settings
from app.main import app
from app.services import channels
from tests.conftest import as_user, new_order

FULL = dict(twilio_account_sid="ACxx", twilio_auth_token="tok", twilio_sms_from="+15550001", twilio_whatsapp_from="whatsapp:+14155238886",
            vapid_public_key="PUB", vapid_private_key="PRIV", vapid_subject="mailto:a@b.co")


@pytest.fixture
def twilio_calls(monkeypatch):
    calls = []

    def fake_post(url, auth=None, data=None, timeout=None):
        calls.append({"url": url, "auth": auth, "data": data})
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(channels.httpx, "post", fake_post)
    return calls


def sub(db, uid="c1", endpoint="https://push.example/1"):
    db.table("push_subscriptions").insert({"user_id": uid, "endpoint": endpoint, "p256dh": "k" * 20, "auth": "a" * 10}).execute()


# ---------- deliver() ----------
def test_nothing_configured_sends_nothing(db, twilio_calls):
    assert channels.deliver(db, "c1", "Hi", "there", None, Settings()) == []
    assert twilio_calls == []


def test_whatsapp_is_on_by_default_sms_is_not(db, twilio_calls):
    assert channels.deliver(db, "c1", "Delivered", "Enjoy", "o1", Settings(**FULL)) == ["whatsapp"]
    call = twilio_calls[0]
    assert call["url"].endswith("/Accounts/ACxx/Messages.json") and call["auth"] == ("ACxx", "tok")
    assert call["data"] == {"From": "whatsapp:+14155238886", "To": "whatsapp:+911", "Body": "Poshak: Delivered. Enjoy"}


def test_sms_when_enabled_and_prefs_respected(db, twilio_calls):
    db.tables["profiles"][0].update(notify_sms=True)
    assert channels.deliver(db, "c1", "Hi", None, None, Settings(**FULL)) == ["whatsapp", "sms"]
    assert [c["data"]["To"] for c in twilio_calls] == ["whatsapp:+911", "+911"]
    twilio_calls.clear()
    db.tables["profiles"][0].update(notify_sms=False, notify_whatsapp=False)
    assert channels.deliver(db, "c1", "Hi", None, None, Settings(**FULL)) == [] and twilio_calls == []


def test_unknown_user_or_missing_phone(db, twilio_calls):
    assert channels.deliver(db, "ghost", "Hi", None, None, Settings(**FULL)) == []
    db.tables["profiles"][0]["phone"] = None
    assert channels.deliver(db, "c1", "Hi", None, None, Settings(**FULL)) == []


def test_one_failing_channel_does_not_block_the_others(db, monkeypatch):
    db.tables["profiles"][0].update(notify_sms=True)
    sent = []

    def flaky(url, auth=None, data=None, timeout=None):
        if data["From"].startswith("whatsapp"):
            raise httpx.ConnectError("down")
        sent.append(data["To"])
        return SimpleNamespace(raise_for_status=lambda: None)

    monkeypatch.setattr(channels.httpx, "post", flaky)
    assert channels.deliver(db, "c1", "Hi", None, None, Settings(**FULL)) == ["whatsapp", "sms"]  # no exception raised
    assert sent == ["+911"]


def test_web_push_payload_and_dead_subscription_cleanup(db, monkeypatch):
    sub(db, endpoint="https://push.example/live"); sub(db, endpoint="https://push.example/gone"); sub(db, uid="c2", endpoint="https://push.example/other")
    sent = []

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims, ttl, timeout):
        if subscription_info["endpoint"].endswith("gone"):
            raise WebPushException("gone", response=SimpleNamespace(status_code=410))
        sent.append((subscription_info["endpoint"], json.loads(data), vapid_claims))

    import pywebpush
    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    s = Settings(vapid_public_key="PUB", vapid_private_key="PRIV", vapid_subject="mailto:a@b.co")
    assert channels.deliver(db, "c1", "Delivered", "Enjoy", "o9", s) == ["push"]
    assert sent == [("https://push.example/live", {"title": "Delivered", "body": "Enjoy", "url": "/orders/o9"}, {"sub": "mailto:a@b.co"})]
    left = [r["endpoint"] for r in db.tables["push_subscriptions"]]
    assert "https://push.example/gone" not in left and "https://push.example/live" in left and "https://push.example/other" in left


def test_push_server_error_keeps_subscription(db, monkeypatch):
    sub(db)
    import pywebpush
    monkeypatch.setattr(pywebpush, "webpush", lambda **k: (_ for _ in ()).throw(WebPushException("boom", response=SimpleNamespace(status_code=500))))
    channels.deliver(db, "c1", "Hi", None, None, Settings(vapid_public_key="P", vapid_private_key="K"))
    assert len(db.tables["push_subscriptions"]) == 1


def test_push_respects_preference(db, monkeypatch):
    sub(db); db.tables["profiles"][0]["notify_push"] = False
    assert channels.deliver(db, "c1", "Hi", None, None, Settings(vapid_public_key="P", vapid_private_key="K")) == []


# ---------- wiring into order updates ----------
def run_lifecycle(api):
    oid = new_order(api).json()["id"]
    for who, path, st in [("p1", "partner", None), ("p1", "partner", "picked_up")]:
        if st is None:
            api.post(f"/partner/orders/{oid}/accept", headers=as_user(who))
        else:
            api.post(f"/{path}/orders/{oid}/status", json={"status": st}, headers=as_user(who))
    api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": 2}, headers=as_user("p1"))
    for who, path, st in [("s1", "shop", "washing"), ("s1", "shop", "ready"), ("p1", "partner", "out_for_delivery"), ("p1", "partner", "delivered")]:
        assert api.post(f"/{path}/orders/{oid}/status", json={"status": st}, headers=as_user(who)).status_code == 200


def test_only_important_statuses_go_external(api, monkeypatch):
    seen = []
    monkeypatch.setattr(channels, "deliver", lambda db, uid, title, body, oid, settings=None: seen.append((uid, title)))
    run_lifecycle(api)
    titles = [t for uid, t in seen if uid == "c1"]
    assert titles == ["Pickup scheduled", "Clothes weighed", "Out for delivery", "Delivered"]   # not placed/picked up/washing/ready


def test_messaging_outage_never_breaks_order_updates(api, monkeypatch):
    def boom(*a, **k): raise RuntimeError("twilio is down")
    monkeypatch.setattr(channels, "deliver", boom)
    run_lifecycle(api)  # all status calls still assert 200


# ---------- endpoints ----------
def test_preferences_endpoint(api, db):
    r = api.patch("/me/preferences", json={"notify_sms": True, "notify_whatsapp": False}, headers=as_user("c1"))
    assert r.status_code == 200 and r.json()["notify_sms"] is True and r.json()["notify_whatsapp"] is False
    assert api.patch("/me/preferences", json={}, headers=as_user("c1")).status_code == 422
    assert api.patch("/me/preferences", json={"notify_sms": True}).status_code == 401


def test_vapid_key_endpoint(api):
    app.dependency_overrides[get_settings] = lambda: Settings()
    assert api.get("/push/vapid-key").status_code == 503
    app.dependency_overrides[get_settings] = lambda: Settings(vapid_public_key="PUBKEY", vapid_private_key="PRIV")
    assert api.get("/push/vapid-key").json() == {"public_key": "PUBKEY"}


def test_subscribe_unsubscribe(api, db):
    body = {"endpoint": "https://push.example/abc", "keys": {"p256dh": "k" * 20, "auth": "a" * 10}}
    assert api.post("/push/subscribe", json=body, headers=as_user("c1")).status_code == 201
    assert api.post("/push/subscribe", json=body, headers=as_user("c2")).status_code == 201  # same browser, new user: re-owned, not duplicated
    assert len(db.tables["push_subscriptions"]) == 1 and db.tables["push_subscriptions"][0]["user_id"] == "c2"
    assert api.post("/push/subscribe", json={**body, "endpoint": "http://insecure"}, headers=as_user("c1")).status_code == 422
    assert api.post("/push/unsubscribe", json={"endpoint": body["endpoint"]}, headers=as_user("c1")).status_code == 204  # not theirs: no-op
    assert len(db.tables["push_subscriptions"]) == 1
    assert api.post("/push/unsubscribe", json={"endpoint": body["endpoint"]}, headers=as_user("c2")).status_code == 204
    assert db.tables["push_subscriptions"] == []
