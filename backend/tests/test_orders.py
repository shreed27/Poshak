from fastapi.testclient import TestClient

from app.main import app
from app.schemas.orders import OrderStatus, can_transition

client = TestClient(app)


def test_health():
    assert client.get("/health").json() == {"status": "ok"}


def test_orders_require_auth():
    assert client.get("/orders").status_code == 401


def test_happy_path_transitions():
    flow = [
        OrderStatus.PLACED, OrderStatus.PICKUP_ASSIGNED, OrderStatus.PICKED_UP,
        OrderStatus.WEIGHED, OrderStatus.WASHING, OrderStatus.READY,
        OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED,
    ]
    for a, b in zip(flow, flow[1:]):
        assert can_transition(a, b)


def test_invalid_transitions():
    assert not can_transition(OrderStatus.PLACED, OrderStatus.DELIVERED)
    assert not can_transition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)
    assert not can_transition(OrderStatus.PICKED_UP, OrderStatus.CANCELLED)
