from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Header
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.main import app
from tests.fakedb import FakeDB


@pytest.fixture
def db():
    d = FakeDB()
    d.seed("profiles", [
        {"id": "c1", "phone": "+911", "role": "customer", "full_name": "Cust"},
        {"id": "c2", "phone": "+912", "role": "customer", "full_name": "Other Cust"},
        {"id": "p1", "phone": "+913", "role": "partner", "full_name": "Partner One"},
        {"id": "p2", "phone": "+914", "role": "partner", "full_name": "Partner Two"},
        {"id": "s1", "phone": "+915", "role": "shop", "full_name": "Shop Owner"},
        {"id": "s2", "phone": "+916", "role": "shop", "full_name": "Other Shop Owner"},
        {"id": "a1", "phone": "+917", "role": "admin", "full_name": "Admin"},
    ])
    d.seed("shops", [
        {"id": "sh1", "name": "Fresh Fold", "owner_id": "s1", "city": "Bengaluru", "rating": None},
        {"id": "sh2", "name": "Other Shop", "owner_id": "s2", "city": "Bengaluru", "rating": None},
    ])
    d.seed("services", [
        {"id": "v1", "shop_id": "sh1", "name": "Wash & Fold", "unit": "kg", "price": 70, "turnaround_hours": 48},
        {"id": "v2", "shop_id": "sh1", "name": "Iron", "unit": "piece", "price": 12, "turnaround_hours": 24},
    ])
    d.seed("addresses", [{"id": "ad1", "user_id": "c1", "line1": "12 Park St", "city": "Bengaluru", "pincode": "560001", "lat": 12.97, "lng": 77.59}])
    return d


@pytest.fixture
def api(db):
    """TestClient where the `X-User` header picks who is calling (role read from the fake profiles table)."""
    def fake_user(x_user: str | None = Header(default=None)):
        if x_user is None:
            from fastapi import HTTPException
            raise HTTPException(401, "Missing token")
        prof = next(p for p in db.tables["profiles"] if p["id"] == x_user)
        return CurrentUser(id=prof["id"], phone=prof["phone"], role=prof["role"])

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = fake_user
    yield TestClient(app)
    app.dependency_overrides.clear()


def as_user(uid: str) -> dict:
    return {"X-User": uid}


def slot(hours_from_now: int = 24) -> dict:
    start = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    return {"pickup_slot_start": start.isoformat(), "pickup_slot_end": (start + timedelta(hours=2)).isoformat()}


def new_order(api, user="c1", items=None, **extra):
    body = {"shop_id": "sh1", "address_id": "ad1", "payment_method": "cod", **slot(),
            "items": items if items is not None else [{"service_id": "v1", "quantity": 3}], **extra}
    return api.post("/orders", json=body, headers=as_user(user))
