from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.services.promos import compute_discount
from tests.conftest import as_user, new_order


def promo(db, code="SAVE", **kw):
    row = {"code": code, "kind": "percent", "value": 10, "max_discount": None, "min_order": 0, "first_order_only": False,
           "usage_limit": None, "per_user_limit": 1, "starts_at": None, "ends_at": None, "is_active": True, "description": "test"}
    db.table("promo_codes").insert({**row, **kw}).execute()


def iso(**delta): return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


# ---------- pure ----------
def test_compute_discount():
    assert compute_discount("percent", 20, None, 300) == Decimal("60.00")
    assert compute_discount("percent", 20, 50, 300) == Decimal("50.00")      # capped
    assert compute_discount("flat", 50, None, 300) == Decimal("50.00")
    assert compute_discount("flat", 500, None, 300) == Decimal("300.00")     # never more than the bill
    assert compute_discount("percent", 12.5, None, 99.99) == Decimal("12.50")


# ---------- validation ----------
def check(api, code, subtotal=210, user="c1"):
    return api.post("/promos/validate", json={"code": code, "subtotal": subtotal}, headers=as_user(user))


def test_validate_preview_is_case_insensitive(api, db):
    promo(db, "SAVE", value=10)
    r = check(api, " save ")
    assert r.status_code == 200 and r.json() == {"code": "SAVE", "description": "test", "discount": 21.0, "total": 189.0}


@pytest.mark.parametrize("kw,fragment", [
    ({"is_active": False}, "not valid"),
    ({"min_order": 500}, "₹500"),
    ({"starts_at": "future"}, "not active yet"),
    ({"ends_at": "past"}, "expired"),
])
def test_validate_rejections(api, db, kw, fragment):
    kw = {k: (iso(days=2) if v == "future" else iso(days=-1) if v == "past" else v) for k, v in kw.items()}
    promo(db, "X", **kw)
    r = check(api, "X")
    assert r.status_code == 422 and fragment in r.json()["detail"]


def test_unknown_code(api):
    assert check(api, "NOPE").status_code == 422


def test_order_applies_discount_and_blocks_reuse(api, db):
    promo(db, "TEN", value=10)
    r = new_order(api, promo_code="ten")  # 3kg * 70 = 210
    assert r.status_code == 201
    o = r.json()
    assert o["estimated_amount"] == 189 and o["discount_amount"] == 21 and o["promo_code"] == "TEN"
    assert new_order(api, promo_code="TEN").status_code == 422          # per-user limit 1
    assert new_order(api, user="c1", promo_code="BOGUS").status_code == 422
    # a cancelled order frees the code again
    api.post(f"/orders/{o['id']}/cancel", headers=as_user("c1"))
    assert new_order(api, promo_code="TEN").status_code == 201


def test_first_order_only(api, db):
    promo(db, "FIRST", first_order_only=True)
    assert new_order(api).status_code == 201          # c1 now has an order
    assert new_order(api, promo_code="FIRST").status_code == 422
    db.table("addresses").insert({"id": "ad2", "user_id": "c2", "line1": "x", "city": "B", "pincode": "560001"}).execute()
    assert new_order(api, user="c2", address_id="ad2", promo_code="FIRST").status_code == 201


def test_usage_limit_is_global(api, db):
    promo(db, "ONCE", usage_limit=1, per_user_limit=5)
    db.table("addresses").insert({"id": "ad2", "user_id": "c2", "line1": "x", "city": "B", "pincode": "560001"}).execute()
    assert new_order(api, promo_code="ONCE").status_code == 201
    r = new_order(api, user="c2", address_id="ad2", promo_code="ONCE")
    assert r.status_code == 422 and "fully redeemed" in r.json()["detail"]


def test_discount_is_recomputed_on_the_weighed_total(api, db):
    promo(db, "TWENTY", value=20, max_discount=50)
    oid = new_order(api, promo_code="TWENTY").json()["id"]   # est 210 -> 20% = 42 -> 168
    api.post(f"/partner/orders/{oid}/accept", headers=as_user("p1"))
    api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p1"))
    w = api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": 6}, headers=as_user("p1")).json()  # 6kg = 420 -> 20% = 84 -> capped 50
    assert float(w["discount_amount"]) == 50 and float(w["final_amount"]) == 370


def test_order_without_promo_unchanged(api):
    o = new_order(api).json()
    assert o["estimated_amount"] == 210 and o["discount_amount"] == 0 and o["promo_code"] is None


# ---------- admin ----------
def test_admin_promo_management(api, db):
    body = {"code": "summer25", "kind": "percent", "value": 25, "max_discount": 150, "min_order": 200, "description": "Summer"}
    assert api.post("/admin/promos", json=body, headers=as_user("c1")).status_code == 403
    r = api.post("/admin/promos", json=body, headers=as_user("a1"))
    assert r.status_code == 201 and r.json()["code"] == "SUMMER25"
    assert api.post("/admin/promos", json=body, headers=as_user("a1")).status_code == 409
    assert api.post("/admin/promos", json={**body, "code": "BIG", "value": 150}, headers=as_user("a1")).status_code == 422
    assert api.post("/admin/promos", json={**body, "code": "bad code!"}, headers=as_user("a1")).status_code == 422
    assert new_order(api, promo_code="SUMMER25", items=[{"service_id": "v1", "quantity": 5}]).status_code == 201
    listed = api.get("/admin/promos", headers=as_user("a1")).json()
    assert listed[0]["redemptions"] == 1
    assert api.patch("/admin/promos/summer25", json={"is_active": False}, headers=as_user("a1")).json()["is_active"] is False
    assert check(api, "SUMMER25", 500, user="c2").status_code == 422
    assert api.patch("/admin/promos/NOPE", json={"is_active": False}, headers=as_user("a1")).status_code == 404
