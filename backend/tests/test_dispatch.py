from datetime import datetime, timedelta, timezone

import pytest

from app.services.dispatch import Candidate, eta_minutes, haversine_km, pick_partner
from tests.conftest import as_user, new_order

HOME = (12.9716, 77.5946)  # c1's address (conftest)


def ago(minutes=0): return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


def partner(db, pid, lat, lng, online=True, minutes_ago=0):
    db.table("partner_status").insert({"partner_id": pid, "is_online": online, "lat": lat, "lng": lng, "updated_at": ago(minutes_ago)}).execute()


# ---------- pure ----------
def test_haversine_and_eta():
    assert haversine_km(*HOME, *HOME) == pytest.approx(0, abs=1e-6)
    assert haversine_km(12.9716, 77.5946, 19.0760, 72.8777) == pytest.approx(845, rel=0.02)  # Bengaluru -> Mumbai
    assert eta_minutes(0.1) == 1 and eta_minutes(10) == 30


def test_pick_nearest_with_load_penalty_radius_and_exclusions():
    near, mid, far = Candidate("near", 12.975, 77.60), Candidate("mid", 13.02, 77.62), Candidate("far", 19.07, 72.87)
    assert pick_partner(*HOME, [mid, near, far]).partner_id == "near"
    assert pick_partner(*HOME, [mid, near, far], exclude={"near"}).partner_id == "mid"
    assert pick_partner(*HOME, [far]) is None                                  # outside radius
    busy_near = Candidate("near", 12.975, 77.60, active_jobs=3)
    assert pick_partner(*HOME, [busy_near, mid]).partner_id == "mid"            # at job cap
    loaded = Candidate("near", 12.975, 77.60, active_jobs=2)                    # 0.7 km + 2 jobs * 1.5 = 3.7
    free = Candidate("free", 12.9986, 77.5946)                                  # ~3.0 km, no jobs      = 3.0
    assert pick_partner(*HOME, [loaded, free]).partner_id == "free"             # spare capacity beats proximity
    assert pick_partner(*HOME, [loaded, mid]).partner_id == "near"              # but not when the free one is much farther
    assert pick_partner(*HOME, []) is None


# ---------- auto assignment on order creation ----------
def test_order_is_auto_assigned_to_nearest_online_partner(api, db):
    partner(db, "p1", 13.02, 77.62)     # ~6 km
    partner(db, "p2", 12.975, 77.60)    # ~0.7 km
    o = new_order(api).json()
    assert o["status"] == "pickup_assigned" and o["partner_id"] == "p2" and o["assigned_by"] == "auto"
    assert any(n["user_id"] == "p2" and n["title"] == "New pickup assigned" for n in db.tables["notifications"])
    assert any(n["user_id"] == "c1" and n["title"] == "Pickup scheduled" for n in db.tables["notifications"])
    assert api.get("/partner/available", headers=as_user("p1")).json() == []   # no longer up for grabs


@pytest.mark.parametrize("kw", [dict(online=False), dict(minutes_ago=30), dict(lat=19.07, lng=72.87)])
def test_ineligible_partners_are_skipped(api, db, kw):
    args = dict(lat=12.975, lng=77.60); args.update(kw)
    partner(db, "p1", args.pop("lat"), args.pop("lng"), **args)
    o = new_order(api).json()
    assert o["status"] == "placed" and o["partner_id"] is None


def test_address_without_coordinates_stays_for_manual_accept(api, db):
    partner(db, "p1", 12.975, 77.60)
    db.table("addresses").insert({"id": "nocoords", "user_id": "c1", "line1": "x", "city": "B", "pincode": "560001"}).execute()
    assert new_order(api, address_id="nocoords").json()["status"] == "placed"


def test_job_cap_overflow_goes_to_next_partner(api, db):
    partner(db, "p1", 12.975, 77.60); partner(db, "p2", 13.02, 77.62)
    owners = [new_order(api).json()["partner_id"] for _ in range(5)]
    assert owners.count("p1") <= 3 and owners.count("p2") >= 1 and None not in owners


def test_waiting_orders_are_picked_up_when_a_partner_goes_online(api, db):
    oid = new_order(api).json()["id"]                       # nobody online
    assert db.tables["orders"][0]["status"] == "placed"
    r = api.post("/partner/status", json={"online": True, "lat": 12.975, "lng": 77.60}, headers=as_user("p1"))
    assert r.status_code == 200 and r.json()["assigned_now"] == 1
    assert db.tables["orders"][0]["partner_id"] == "p1" and db.tables["orders"][0]["id"] == oid
    r2 = api.post("/partner/status", json={"online": False}, headers=as_user("p1"))
    assert r2.json()["is_online"] is False and r2.json()["assigned_now"] == 0


def test_location_ping_triggers_dispatch_and_validates(api, db):
    api.post("/partner/status", json={"online": True}, headers=as_user("p1"))          # online, no location yet
    new_order(api)
    assert db.tables["orders"][0]["status"] == "placed"
    assert api.post("/partner/location", json={"lat": 12.975, "lng": 77.60}, headers=as_user("p1")).status_code == 204
    assert db.tables["orders"][0]["partner_id"] == "p1"
    assert api.post("/partner/location", json={"lat": 123, "lng": 0}, headers=as_user("p1")).status_code == 422
    assert api.post("/partner/location", json={"lat": 1, "lng": 1}, headers=as_user("c1")).status_code == 403
    assert api.get("/partner/status", headers=as_user("p1")).json()["is_online"] is True


# ---------- release & reassign ----------
def test_release_reassigns_to_someone_else_not_back_to_releaser(api, db):
    partner(db, "p1", 12.975, 77.60); partner(db, "p2", 13.02, 77.62)
    oid = new_order(api).json()["id"]
    assert db.tables["orders"][0]["partner_id"] == "p1"
    assert api.post(f"/partner/orders/{oid}/release", headers=as_user("p2")).status_code == 403   # not theirs
    r = api.post(f"/partner/orders/{oid}/release", headers=as_user("p1")).json()
    assert r["partner_id"] == "p2" and r["status"] == "pickup_assigned" and "p1" in r["declined_by"]


def test_release_with_no_one_else_returns_order_to_the_pool(api, db):
    partner(db, "p1", 12.975, 77.60)
    oid = new_order(api).json()["id"]
    r = api.post(f"/partner/orders/{oid}/release", headers=as_user("p1")).json()
    assert r["status"] == "placed" and r["partner_id"] is None
    assert [o["id"] for o in api.get("/partner/available", headers=as_user("p2")).json()] == [oid]


def test_cannot_release_after_pickup(api, db):
    partner(db, "p1", 12.975, 77.60)
    oid = new_order(api).json()["id"]
    api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p1"))
    assert api.post(f"/partner/orders/{oid}/release", headers=as_user("p1")).status_code == 409


# ---------- tracking ----------
def test_customer_sees_distance_and_eta_not_coordinates(api, db):
    partner(db, "p1", 12.99, 77.60)
    oid = new_order(api).json()["id"]
    t = api.get(f"/orders/{oid}", headers=as_user("c1")).json()["partner_tracking"]
    assert t["name"] == "Partner" and t["heading"] == "pickup" and t["distance_km"] > 0 and t["eta_minutes"] >= 1
    assert "lat" not in t and "lng" not in t
    api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p1"))
    assert api.get(f"/orders/{oid}", headers=as_user("c1")).json()["partner_tracking"] is None   # not tracked while at the shop


def test_tracking_hidden_when_location_is_stale(api, db):
    partner(db, "p1", 12.99, 77.60)
    oid = new_order(api).json()["id"]
    db.tables["partner_status"][0]["updated_at"] = ago(30)
    assert api.get(f"/orders/{oid}", headers=as_user("c1")).json()["partner_tracking"] is None
