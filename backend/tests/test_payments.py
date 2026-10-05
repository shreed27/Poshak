import hashlib
import hmac
import json

import httpx
import pytest

from app.config import Settings, get_settings
from app.main import app
from app.services import razorpay
from app.services.refunds import plan_refund
from tests.conftest import as_user, new_order

WH_SECRET = "whsec"


@pytest.fixture(autouse=True)
def settings():
    app.dependency_overrides[get_settings] = lambda: Settings(razorpay_key_id="rzp_test", razorpay_key_secret="ksecret", razorpay_webhook_secret=WH_SECRET)
    yield


def sign(body: bytes, secret=WH_SECRET) -> dict:
    return {"x-razorpay-signature": hmac.new(secret.encode(), body, hashlib.sha256).hexdigest(), "content-type": "application/json"}


def delivered_order(api, method="cod", kg=4.0):
    oid = new_order(api, payment_method=method).json()["id"]
    api.post(f"/partner/orders/{oid}/accept", headers=as_user("p1"))
    api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p1"))
    api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": kg}, headers=as_user("p1"))  # 4kg * 70 = 280
    return oid


def finish(api, oid):
    for who, path, st in [("s1", "shop", "washing"), ("s1", "shop", "ready"), ("p1", "partner", "out_for_delivery"), ("p1", "partner", "delivered")]:
        assert api.post(f"/{path}/orders/{oid}/status", json={"status": st}, headers=as_user(who)).status_code == 200


# ---------- pure refund planning ----------
def test_plan_refund():
    assert plan_refund(280, 0) == (280, "refunded")
    assert plan_refund(280, 0, 100) == (100, "partially_refunded")
    assert plan_refund(280, 100, 180) == (180, "refunded")
    for bad in [(280, 280), (280, 0, 0), (280, 0, -5), (280, 0, 300), (280, 200, 100)]:
        with pytest.raises(ValueError):
            plan_refund(*bad)


# ---------- webhook ----------
def make_online_payment(api, db, oid):
    db.table("payments").insert({"order_id": oid, "razorpay_order_id": "order_RP1", "amount": 280, "status": "created"}).execute()


def hook(api, event: dict, headers=None):
    body = json.dumps(event).encode()
    return api.post("/payments/webhook", content=body, headers=headers or sign(body))


def captured(order_id="order_RP1", pay_id="pay_1"):
    return {"event": "payment.captured", "payload": {"payment": {"entity": {"id": pay_id, "order_id": order_id, "status": "captured"}}}}


def test_webhook_rejects_bad_or_missing_signature(api):
    body = json.dumps(captured()).encode()
    assert api.post("/payments/webhook", content=body, headers={"x-razorpay-signature": "bad"}).status_code == 400
    assert api.post("/payments/webhook", content=body).status_code == 400
    assert api.post("/payments/webhook", content=body, headers=sign(body, secret="wrong")).status_code == 400


def test_webhook_unconfigured_returns_503(api):
    app.dependency_overrides[get_settings] = lambda: Settings(razorpay_webhook_secret="")
    assert hook(api, captured(), headers={"x-razorpay-signature": "x"}).status_code == 503


def test_webhook_marks_order_paid_once(api, db):
    oid = delivered_order(api, "online")
    make_online_payment(api, db, oid)
    assert hook(api, captured()).json() == {"received": True}
    order = db.tables["orders"][0]
    assert order["payment_status"] == "paid"
    assert db.tables["payments"][0]["razorpay_payment_id"] == "pay_1"
    n = len(db.tables["notifications"])
    hook(api, captured())  # Razorpay retries: must not notify or change again
    assert len(db.tables["notifications"]) == n


def test_webhook_ignores_unknown_orders_and_events(api, db):
    assert hook(api, captured(order_id="order_UNKNOWN")).status_code == 200
    assert hook(api, {"event": "something.else", "payload": {}}).status_code == 200


def test_webhook_failed_payment_does_not_override_paid(api, db):
    oid = delivered_order(api, "online")
    make_online_payment(api, db, oid)
    hook(api, captured())
    hook(api, {"event": "payment.failed", "payload": {"payment": {"entity": {"order_id": "order_RP1"}}}})
    assert db.tables["payments"][0]["status"] == "paid"


def test_online_payment_end_to_end(api, db, monkeypatch):
    monkeypatch.setattr(razorpay, "create_order", lambda *a, **k: {"id": "order_RP1", "amount": 28000})
    oid = delivered_order(api, "online")
    assert api.post(f"/payments/{oid}/create", headers=as_user("c2")).status_code == 404  # not their order
    p = api.post(f"/payments/{oid}/create", headers=as_user("c1")).json()
    assert p["amount"] == 28000 and p["razorpay_order_id"] == "order_RP1"
    sig = hmac.new(b"ksecret", b"order_RP1|pay_9", hashlib.sha256).hexdigest()
    bad = api.post("/payments/verify", json={"razorpay_order_id": "order_RP1", "razorpay_payment_id": "pay_9", "razorpay_signature": "nope"}, headers=as_user("c1"))
    assert bad.status_code == 400 and db.tables["payments"][0]["status"] == "failed"
    ok = api.post("/payments/verify", json={"razorpay_order_id": "order_RP1", "razorpay_payment_id": "pay_9", "razorpay_signature": sig}, headers=as_user("c1"))
    assert ok.json() == {"payment_status": "paid"} and db.tables["orders"][0]["payment_status"] == "paid"
    assert api.post(f"/payments/{oid}/create", headers=as_user("c1")).status_code == 409  # already paid


def test_cannot_pay_before_weighing_or_for_cod(api):
    oid = new_order(api, payment_method="online").json()["id"]
    assert api.post(f"/payments/{oid}/create", headers=as_user("c1")).status_code == 409
    cod = new_order(api).json()["id"]
    assert api.post(f"/payments/{cod}/create", headers=as_user("c1")).status_code == 409


# ---------- refunds ----------
def test_cod_refund_partial_then_rest(api, db):
    oid = delivered_order(api, "cod"); finish(api, oid)  # paid 280 on delivery
    assert api.post(f"/admin/orders/{oid}/refund", json={"amount": 100, "reason": "stain"}, headers=as_user("c1")).status_code == 403
    r = api.post(f"/admin/orders/{oid}/refund", json={"amount": 100, "reason": "stain"}, headers=as_user("a1"))
    assert r.status_code == 201 and r.json()["status"] == "manual"
    o = db.tables["orders"][0]
    assert o["payment_status"] == "partially_refunded" and float(o["refunded_amount"]) == 100
    assert api.post(f"/admin/orders/{oid}/refund", json={"amount": 500}, headers=as_user("a1")).status_code == 422  # over balance
    assert api.post(f"/admin/orders/{oid}/refund", json={}, headers=as_user("a1")).status_code == 201  # rest
    assert db.tables["orders"][0]["payment_status"] == "refunded" and float(db.tables["orders"][0]["refunded_amount"]) == 280
    assert api.post(f"/admin/orders/{oid}/refund", json={}, headers=as_user("a1")).status_code in (409, 422)
    assert any(n["title"] == "Refund initiated" for n in db.tables["notifications"])


def test_unpaid_order_cannot_be_refunded(api):
    oid = delivered_order(api, "cod")
    assert api.post(f"/admin/orders/{oid}/refund", json={}, headers=as_user("a1")).status_code == 409


def test_online_refund_calls_razorpay_and_webhook_confirms(api, db, monkeypatch):
    oid = delivered_order(api, "online")
    make_online_payment(api, db, oid); hook(api, captured())
    finish(api, oid)
    calls = []
    monkeypatch.setattr(razorpay, "create_refund", lambda key, sec, pay_id, amt, receipt: calls.append((pay_id, amt)) or {"id": "rfnd_1"})
    r = api.post(f"/admin/orders/{oid}/refund", json={"amount": 80}, headers=as_user("a1"))
    assert r.status_code == 201 and calls == [("pay_1", 80.0)]
    assert db.tables["refunds"][0]["status"] == "pending" and db.tables["refunds"][0]["razorpay_refund_id"] == "rfnd_1"
    hook(api, {"event": "refund.processed", "payload": {"refund": {"entity": {"id": "rfnd_1"}}}})
    assert db.tables["refunds"][0]["status"] == "processed"


def test_failed_razorpay_refund_rolls_back(api, db, monkeypatch):
    oid = delivered_order(api, "online")
    make_online_payment(api, db, oid); hook(api, captured())
    finish(api, oid)

    def boom(*a, **k): raise httpx.ConnectError("down")
    monkeypatch.setattr(razorpay, "create_refund", boom)
    assert api.post(f"/admin/orders/{oid}/refund", json={"amount": 80}, headers=as_user("a1")).status_code == 502
    o = db.tables["orders"][0]
    assert float(o["refunded_amount"]) == 0 and o["payment_status"] == "paid"  # balance untouched, can retry
    assert db.tables.get("refunds", []) == []
