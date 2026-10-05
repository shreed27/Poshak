"""End-to-end API tests: whole order lifecycle plus the access rules, against the in-memory DB."""
from tests.conftest import as_user, new_order, slot


def test_full_lifecycle_cod(api, db):
    r = new_order(api, items=[{"service_id": "v1", "quantity": 3}, {"service_id": "v2", "quantity": 5}])
    assert r.status_code == 201, r.text
    oid = r.json()["id"]
    assert r.json()["estimated_amount"] == 3 * 70 + 5 * 12  # 270

    assert api.post(f"/partner/orders/{oid}/accept", headers=as_user("p1")).json()["status"] == "pickup_assigned"
    assert api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p1")).status_code == 200
    w = api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": 4.5}, headers=as_user("p1")).json()
    assert w["status"] == "weighed" and w["weight_kg"] == 4.5
    assert float(w["final_amount"]) == 4.5 * 70 + 5 * 12  # kg billed on weight, pieces on count = 375

    assert api.post(f"/shop/orders/{oid}/status", json={"status": "washing"}, headers=as_user("s1")).status_code == 200
    assert api.post(f"/shop/orders/{oid}/status", json={"status": "ready"}, headers=as_user("s1")).status_code == 200
    assert api.post(f"/partner/orders/{oid}/status", json={"status": "out_for_delivery"}, headers=as_user("p1")).status_code == 200
    done = api.post(f"/partner/orders/{oid}/status", json={"status": "delivered"}, headers=as_user("p1")).json()
    assert done["status"] == "delivered" and done["payment_status"] == "paid"  # COD collected on delivery

    detail = api.get(f"/orders/{oid}", headers=as_user("c1")).json()
    assert [e["status"] for e in detail["order_events"]][0] == "placed" and detail["order_events"][-1]["status"] == "delivered"
    assert len(detail["order_items"]) == 2 and detail["shops"]["name"] == "Fresh Fold"

    assert api.post(f"/orders/{oid}/rating", json={"rating": 4, "review": "great"}, headers=as_user("c1")).json()["shop_rating"] == 4.0
    assert api.post(f"/orders/{oid}/rating", json={"rating": 5}, headers=as_user("c1")).status_code == 409  # only once
    notes = api.get("/notifications", headers=as_user("c1")).json()
    assert notes["unread"] >= 6 and any(n["title"] == "Delivered" for n in notes["items"])


def test_order_validation(api):
    assert new_order(api, items=[]).status_code == 422
    assert new_order(api, items=[{"service_id": "nope", "quantity": 1}]).status_code == 422
    assert new_order(api, items=[{"service_id": "v1", "quantity": 0}]).status_code == 422
    assert api.post("/orders", json={"shop_id": "sh1", "address_id": "ad1", "payment_method": "cod", **slot(-5), "items": [{"service_id": "v1", "quantity": 1}]}, headers=as_user("c1")).status_code == 422
    assert new_order(api, user="c2").status_code == 422  # address belongs to c1
    assert new_order(api, shop_id="sh2").status_code == 422  # service not offered by that shop


def test_customers_cannot_see_each_others_orders(api):
    oid = new_order(api).json()["id"]
    assert api.get(f"/orders/{oid}", headers=as_user("c2")).status_code == 404
    assert api.post(f"/orders/{oid}/cancel", headers=as_user("c2")).status_code == 404
    assert api.get("/orders", headers=as_user("c2")).json() == []
    assert len(api.get("/orders", headers=as_user("c1")).json()) == 1


def test_partner_isolation_and_race(api):
    oid = new_order(api).json()["id"]
    assert [o["id"] for o in api.get("/partner/available", headers=as_user("p2")).json()] == [oid]
    assert api.post(f"/partner/orders/{oid}/accept", headers=as_user("p1")).status_code == 200
    assert api.post(f"/partner/orders/{oid}/accept", headers=as_user("p2")).status_code == 409  # already taken
    assert api.get("/partner/available", headers=as_user("p2")).json() == []
    # p2 cannot act on p1's order
    assert api.post(f"/partner/orders/{oid}/status", json={"status": "picked_up"}, headers=as_user("p2")).status_code == 403
    assert api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": 2}, headers=as_user("p2")).status_code == 403


def test_status_rules(api):
    oid = new_order(api).json()["id"]
    api.post(f"/partner/orders/{oid}/accept", headers=as_user("p1"))
    # cannot skip steps, cannot set statuses outside the role, cannot weigh before pickup
    assert api.post(f"/partner/orders/{oid}/status", json={"status": "delivered"}, headers=as_user("p1")).status_code == 409
    assert api.post(f"/partner/orders/{oid}/status", json={"status": "washing"}, headers=as_user("p1")).status_code == 403
    assert api.post(f"/partner/orders/{oid}/weigh", json={"weight_kg": 2}, headers=as_user("p1")).status_code == 409
    assert api.post(f"/shop/orders/{oid}/status", json={"status": "delivered"}, headers=as_user("s1")).status_code == 403
    # a shop can only touch its own orders
    assert api.post(f"/shop/orders/{oid}/status", json={"status": "washing"}, headers=as_user("s2")).status_code == 403


def test_cancel_rules(api):
    oid = new_order(api).json()["id"]
    assert api.post(f"/orders/{oid}/cancel", headers=as_user("c1")).json()["status"] == "cancelled"
    assert api.post(f"/orders/{oid}/cancel", headers=as_user("c1")).status_code == 409
    oid2 = new_order(api).json()["id"]
    api.post(f"/partner/orders/{oid2}/accept", headers=as_user("p1"))
    api.post(f"/partner/orders/{oid2}/status", json={"status": "picked_up"}, headers=as_user("p1"))
    assert api.post(f"/orders/{oid2}/cancel", headers=as_user("c1")).status_code == 409  # too late once picked up


def test_rating_only_after_delivery(api):
    oid = new_order(api).json()["id"]
    assert api.post(f"/orders/{oid}/rating", json={"rating": 5}, headers=as_user("c1")).status_code == 409
    assert api.post(f"/orders/{oid}/rating", json={"rating": 9}, headers=as_user("c1")).status_code == 422


def test_shop_menu_management_scoped_to_owner(api):
    ok = api.post("/shop/services", json={"shop_id": "sh1", "name": "Blanket", "unit": "piece", "price": 200}, headers=as_user("s1"))
    assert ok.status_code == 201
    assert api.post("/shop/services", json={"shop_id": "sh1", "name": "X", "unit": "piece", "price": 1}, headers=as_user("s2")).status_code == 403
    assert api.patch(f"/shop/services/{ok.json()['id']}", json={"price": 250}, headers=as_user("s1")).json()["price"] in (250, "250")
    assert api.patch(f"/shop/services/{ok.json()['id']}", json={"price": 1}, headers=as_user("s2")).status_code == 403
    assert api.post("/shop/services", json={"shop_id": "sh1", "name": "Bad", "unit": "piece", "price": -5}, headers=as_user("s1")).status_code == 422


def test_admin_controls(api, db):
    assert api.get("/admin/stats", headers=as_user("c1")).status_code == 403
    assert api.patch("/admin/users/c1/role", json={"role": "partner"}, headers=as_user("a1")).json()["role"] == "partner"
    assert api.patch("/admin/users/a1/role", json={"role": "customer"}, headers=as_user("a1")).status_code == 409  # can't demote self
    oid = new_order(api).json()["id"]
    assert api.post(f"/admin/orders/{oid}/assign", json={"partner_id": "c2"}, headers=as_user("a1")).status_code == 422  # not a partner
    assert api.post(f"/admin/orders/{oid}/assign", json={"partner_id": "p2"}, headers=as_user("a1")).json()["status"] == "pickup_assigned"
    stats = api.get("/admin/stats", headers=as_user("a1")).json()
    assert stats["orders"] == 1 and stats["by_status"]["pickup_assigned"] == 1
