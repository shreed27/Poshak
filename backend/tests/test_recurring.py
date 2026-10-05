from datetime import date, datetime, timedelta, timezone

import pytest

from app.config import Settings, get_settings
from app.main import app
from app.services.recurring import IST, advance, next_weekday, run_due, slot_for, today_ist
from tests.conftest import as_user

MON = date(2026, 10, 5)  # a Monday


# ---------- pure date helpers ----------
def test_next_weekday_is_strictly_after():
    assert MON.weekday() == 0
    assert next_weekday(MON, 0) == date(2026, 10, 12)            # same weekday -> next week, never today
    assert next_weekday(MON, 2) == date(2026, 10, 7)
    assert next_weekday(date(2026, 10, 11), 0) == date(2026, 10, 12)  # Sunday -> Monday
    assert all(next_weekday(MON, w) > MON and next_weekday(MON, w).weekday() == w for w in range(7))


def test_advance_and_slot():
    assert advance(MON, "weekly") == date(2026, 10, 12) and advance(MON, "biweekly") == date(2026, 10, 19)
    s, e = slot_for(MON, 8, 10)
    assert s.tzinfo == IST and (s.hour, e.hour) == (8, 10) and s.utcoffset() == timedelta(hours=5, minutes=30)


def test_today_is_india_date_not_utc():
    late_utc = datetime(2026, 10, 5, 20, 0, tzinfo=timezone.utc)  # 01:30 IST on the 6th
    assert today_ist(late_utc) == date(2026, 10, 6)


# ---------- helpers ----------
def body(**kw):
    return {"shop_id": "sh1", "address_id": "ad1", "items": [{"service_id": "v1", "quantity": 3}], "payment_method": "cod",
            "frequency": "weekly", "slot_start_hour": 8, "slot_end_hour": 10, **kw}


def create(api, user="c1", **kw):
    return api.post("/recurring", json=body(**kw), headers=as_user(user))


def tomorrow(): return today_ist() + timedelta(days=1)


# ---------- customer API ----------
def test_create_with_weekday_picks_next_occurrence(api):
    r = create(api, weekday=2)
    assert r.status_code == 201
    d = date.fromisoformat(r.json()["next_run_date"])
    assert d.weekday() == 2 and d > today_ist() and r.json()["status"] == "active" and r.json()["weekday"] == 2


def test_create_with_first_pickup_derives_weekday(api):
    first = today_ist() + timedelta(days=10)
    r = create(api, first_pickup=first.isoformat()).json()
    assert r["next_run_date"] == first.isoformat() and r["weekday"] == first.weekday()


@pytest.mark.parametrize("kw,code", [
    (dict(), 422),                                              # neither weekday nor first_pickup
    (dict(weekday=7), 422), (dict(weekday=-1), 422),
    (dict(weekday=1, slot_start_hour=10, slot_end_hour=8), 422),
    (dict(weekday=1, slot_start_hour=5), 422), (dict(weekday=1, slot_end_hour=23), 422),
    (dict(weekday=1, items=[]), 422),
    (dict(weekday=1, frequency="daily"), 422),
    (dict(weekday=1, first_pickup=today_ist().isoformat()), 422),   # not in the future
    (dict(weekday=1, items=[{"service_id": "nope", "quantity": 1}]), 422),
    (dict(weekday=1, shop_id="sh2"), 422),                      # service not offered by that shop
    (dict(weekday=1, address_id="ghost"), 422),
])
def test_create_validation(api, kw, code):
    assert create(api, **kw).status_code == code


def test_cannot_use_someone_elses_address_or_exceed_limit(api, db):
    assert create(api, user="c2", weekday=1).status_code == 422
    for _ in range(5):
        assert create(api, weekday=1).status_code == 201
    assert create(api, weekday=1).status_code == 409


def test_list_pause_resume_cancel_and_ownership(api):
    sid = create(api, weekday=3).json()["id"]
    assert api.get("/recurring", headers=as_user("c2")).json() == []
    listed = api.get("/recurring", headers=as_user("c1")).json()
    assert len(listed) == 1 and listed[0]["shops"]["name"] == "Fresh Fold"
    assert api.patch(f"/recurring/{sid}", json={"status": "paused"}, headers=as_user("c2")).status_code == 404
    assert api.patch(f"/recurring/{sid}", json={"status": "paused"}, headers=as_user("c1")).json()["status"] == "paused"
    assert api.patch(f"/recurring/{sid}", json={"status": "active"}, headers=as_user("c1")).json()["status"] == "active"
    assert api.patch(f"/recurring/{sid}", json={"status": "cancelled"}, headers=as_user("c1")).status_code == 200
    assert api.get("/recurring", headers=as_user("c1")).json() == []
    assert api.patch(f"/recurring/{sid}", json={"status": "active"}, headers=as_user("c1")).status_code == 409
    assert api.patch(f"/recurring/{sid}", json={"status": "bogus"}, headers=as_user("c1")).status_code == 422


def test_resume_after_date_passed_moves_to_next_occurrence(api, db):
    sid = create(api, weekday=3).json()["id"]
    db.tables["recurring_orders"][0].update(status="paused", next_run_date=(today_ist() - timedelta(days=9)).isoformat(), last_error="old")
    r = api.patch(f"/recurring/{sid}", json={"status": "active"}, headers=as_user("c1")).json()
    assert date.fromisoformat(r["next_run_date"]) > today_ist() and date.fromisoformat(r["next_run_date"]).weekday() == 3 and r["last_error"] is None


# ---------- scheduler ----------
def due_schedule(db, **kw):
    db.table("recurring_orders").insert({
        "customer_id": "c1", "shop_id": "sh1", "address_id": "ad1", "items": [{"service_id": "v1", "quantity": 3}],
        "payment_method": "cod", "frequency": "weekly", "weekday": tomorrow().weekday(), "slot_start_hour": 8, "slot_end_hour": 10,
        "next_run_date": tomorrow().isoformat(), "status": "active", "last_order_id": None, "last_error": None, **kw}).execute()


def at(hour_ist, day=None):
    d = day or today_ist()
    return datetime.combine(d, datetime.min.time(), IST).replace(hour=hour_ist).astimezone(timezone.utc)


def test_run_due_places_the_order_and_advances(api, db):
    due_schedule(db)
    assert run_due(db, at(0)) == {"created": 1, "paused": 0, "missed": 0}
    o = db.tables["orders"][0]
    assert o["customer_id"] == "c1" and o["status"] == "placed" and o["estimated_amount"] == 210
    start = datetime.fromisoformat(o["pickup_slot_start"]).astimezone(IST)
    assert start.date() == tomorrow() and start.hour == 8
    s = db.tables["recurring_orders"][0]
    assert s["next_run_date"] == (tomorrow() + timedelta(days=7)).isoformat() and s["last_order_id"] == o["id"] and s["last_error"] is None
    assert len(db.tables["order_items"]) == 1


def test_run_due_is_idempotent_so_a_cron_retry_cannot_duplicate(api, db):
    due_schedule(db)
    run_due(db, at(0)); run_due(db, at(0)); run_due(db, at(1))
    assert len(db.tables["orders"]) == 1


def test_not_due_paused_cancelled_and_far_future_are_skipped(api, db):
    due_schedule(db, status="paused"); due_schedule(db, status="cancelled")
    due_schedule(db, next_run_date=(today_ist() + timedelta(days=5)).isoformat())
    assert run_due(db, at(0)) == {"created": 0, "paused": 0, "missed": 0} and db.tables.get("orders", []) == []


def test_biweekly_advances_two_weeks(api, db):
    due_schedule(db, frequency="biweekly")
    run_due(db, at(0))
    assert db.tables["recurring_orders"][0]["next_run_date"] == (tomorrow() + timedelta(days=14)).isoformat()


def test_missed_pickup_is_skipped_not_backdated(api, db):
    due_schedule(db, next_run_date=today_ist().isoformat())            # today's 8-10am slot...
    assert run_due(db, at(9)) == {"created": 0, "paused": 0, "missed": 1}   # ...but it is already 9am
    s = db.tables["recurring_orders"][0]
    assert "Missed" in s["last_error"] and s["next_run_date"] == (today_ist() + timedelta(days=7)).isoformat() and db.tables.get("orders", []) == []


def test_removed_service_pauses_schedule_and_notifies(api, db):
    due_schedule(db)
    db.tables["services"][0]["is_active"] = False
    assert run_due(db, at(0)) == {"created": 0, "paused": 1, "missed": 0}
    s = db.tables["recurring_orders"][0]
    assert s["status"] == "paused" and "service" in s["last_error"].lower()
    n = [x for x in db.tables["notifications"] if x["title"] == "Your repeat order was paused"]
    assert len(n) == 1 and n[0]["user_id"] == "c1"


def test_scheduled_orders_get_auto_assigned_like_manual_ones(api, db):
    db.table("partner_status").insert({"partner_id": "p1", "is_online": True, "lat": 12.975, "lng": 77.60, "updated_at": datetime.now(timezone.utc).isoformat()}).execute()
    due_schedule(db)
    run_due(db, at(0))
    assert db.tables["orders"][0]["partner_id"] == "p1" and db.tables["orders"][0]["status"] == "pickup_assigned"


# ---------- cron endpoint ----------
def test_cron_requires_the_secret(api, db):
    app.dependency_overrides[get_settings] = lambda: Settings()
    assert api.get("/cron/recurring").status_code == 503
    app.dependency_overrides[get_settings] = lambda: Settings(cron_secret="s3cret")
    assert api.get("/cron/recurring").status_code == 401
    assert api.get("/cron/recurring", headers={"authorization": "Bearer wrong"}).status_code == 401
    assert api.get("/cron/recurring", headers={"authorization": "s3cret"}).status_code == 401
    ok = api.get("/cron/recurring", headers={"authorization": "Bearer s3cret"})
    assert ok.status_code == 200 and ok.json() == {"created": 0, "paused": 0, "missed": 0}
    assert api.post("/cron/recurring", headers={"authorization": "Bearer s3cret"}).status_code == 200
