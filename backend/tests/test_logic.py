import hashlib
import hmac
from decimal import Decimal

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.main import app
from app.permissions import role_can_set
from app.schemas.orders import OrderStatus as S
from app.services.pricing import estimate, final_amount
from app.services.razorpay import verify_signature


def test_estimate():
    assert estimate([{"unit_price": 70, "quantity": 3}, {"unit_price": 12, "quantity": 5}]) == Decimal(270)


def test_final_amount_bills_kg_on_weight_and_pieces_on_count():
    lines = [
        {"unit_price": 70, "quantity": 3, "unit": "kg"},     # estimated 3kg, actually 4.5kg
        {"unit_price": 12, "quantity": 5, "unit": "piece"},
    ]
    assert final_amount(lines, 4.5) == Decimal("375.00")


def test_signature():
    sig = hmac.new(b"secret", b"order_1|pay_1", hashlib.sha256).hexdigest()
    assert verify_signature("secret", "order_1", "pay_1", sig)
    assert not verify_signature("secret", "order_1", "pay_2", sig)
    assert not verify_signature("other", "order_1", "pay_1", sig)


def test_role_status_permissions():
    assert role_can_set("partner", S.PICKED_UP) and role_can_set("partner", S.DELIVERED)
    assert not role_can_set("partner", S.WASHING)
    assert role_can_set("shop", S.WASHING) and role_can_set("shop", S.READY)
    assert not role_can_set("shop", S.DELIVERED)
    assert not role_can_set("customer", S.DELIVERED)
    assert role_can_set("admin", S.CANCELLED)


def as_role(role: str) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="u1", phone="+911", role=role)
    app.dependency_overrides[get_db] = lambda: MagicMock()
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset():
    yield
    app.dependency_overrides.clear()


@pytest.mark.parametrize("path", ["/partner/available", "/shop/orders", "/admin/stats", "/admin/users"])
def test_customer_is_forbidden_from_staff_routes(path):
    assert as_role("customer").get(path).status_code == 403


def test_partner_cannot_use_shop_or_admin_routes():
    c = as_role("partner")
    assert c.get("/shop/orders").status_code == 403
    assert c.get("/admin/stats").status_code == 403


def test_shop_cannot_use_partner_or_admin_routes():
    c = as_role("shop")
    assert c.get("/partner/available").status_code == 403
    assert c.get("/admin/orders").status_code == 403


def test_status_validation_rejects_bad_enum():
    assert as_role("partner").post("/partner/orders/x/status", json={"status": "bogus"}).status_code == 422


def test_weigh_validates_weight():
    assert as_role("partner").post("/partner/orders/x/weigh", json={"weight_kg": -1}).status_code == 422


# ---- photos ----
from unittest.mock import MagicMock as _M
from fastapi import HTTPException
from app.services.photos import attach_photo_urls, validate_photo_paths


def test_photo_paths_must_be_in_users_folder():
    assert validate_photo_paths(["u1/a.jpg", "u1/b.jpg"], "u1") == ["u1/a.jpg", "u1/b.jpg"]
    for bad in (["u2/a.jpg"], ["u1/../u2/a.jpg"], ["a.jpg"], ["u1/"], ["u10/a.jpg"]):
        with pytest.raises(HTTPException) as e:
            validate_photo_paths(bad, "u1")
        assert e.value.status_code == 422


def test_photo_limit():
    with pytest.raises(HTTPException):
        validate_photo_paths([f"u1/{i}.jpg" for i in range(7)], "u1")


def test_attach_photo_urls_signs_in_one_call_and_drops_failures():
    db = _M()
    db.storage.from_.return_value.create_signed_urls.return_value = [
        {"path": "u1/a.jpg", "signedURL": "https://x/a?t=1", "error": None},
        {"path": "u1/b.jpg", "signedURL": None, "error": "not found"},
    ]
    orders = [{"order_photos": [{"id": "1", "path": "u1/a.jpg"}, {"id": "2", "path": "u1/b.jpg"}]}, {"order_photos": []}]
    out = attach_photo_urls(db, orders)
    assert out[0]["order_photos"] == [{"id": "1", "url": "https://x/a?t=1"}]
    assert out[1]["order_photos"] == []
    db.storage.from_.return_value.create_signed_urls.assert_called_once()


def test_attach_photo_urls_skips_storage_call_when_no_photos():
    db = _M()
    attach_photo_urls(db, [{"order_photos": []}])
    db.storage.from_.assert_not_called()
