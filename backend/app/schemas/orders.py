from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class OrderStatus(StrEnum):
    PLACED = "placed"
    PICKUP_ASSIGNED = "pickup_assigned"
    PICKED_UP = "picked_up"
    WEIGHED = "weighed"
    WASHING = "washing"
    READY = "ready"
    OUT_FOR_DELIVERY = "out_for_delivery"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


# Allowed transitions; the single source of truth for order flow.
TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.PLACED: {OrderStatus.PICKUP_ASSIGNED, OrderStatus.CANCELLED},
    OrderStatus.PICKUP_ASSIGNED: {OrderStatus.PICKED_UP, OrderStatus.CANCELLED},
    OrderStatus.PICKED_UP: {OrderStatus.WEIGHED},
    OrderStatus.WEIGHED: {OrderStatus.WASHING},
    OrderStatus.WASHING: {OrderStatus.READY},
    OrderStatus.READY: {OrderStatus.OUT_FOR_DELIVERY},
    OrderStatus.OUT_FOR_DELIVERY: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}


def can_transition(current: OrderStatus, new: OrderStatus) -> bool:
    return new in TRANSITIONS[current]


class OrderItemIn(BaseModel):
    service_id: str
    quantity: float = Field(gt=0, description="kg or pieces, per service unit")


class OrderCreate(BaseModel):
    shop_id: str
    address_id: str
    pickup_slot_start: datetime
    pickup_slot_end: datetime
    items: list[OrderItemIn] = Field(min_length=1)
    payment_method: Literal["online", "cod"] = "cod"
    photo_paths: list[str] = Field(default_factory=list, max_length=6)


class StatusUpdate(BaseModel):
    status: OrderStatus


class WeighIn(BaseModel):
    weight_kg: float = Field(gt=0, le=100)


class RatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    review: str | None = Field(default=None, max_length=500)
