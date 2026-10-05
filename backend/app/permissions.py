from app.schemas.orders import OrderStatus as S

# Which statuses each role may set (assignment to a partner goes through /partner/.../accept).
ROLE_STATUSES: dict[str, set[S]] = {
    "partner": {S.PICKED_UP, S.OUT_FOR_DELIVERY, S.DELIVERED},
    "shop": {S.WASHING, S.READY},
    "admin": set(S),
}


def role_can_set(role: str, status: S) -> bool:
    return status in ROLE_STATUSES.get(role, set())
