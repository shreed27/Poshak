from fastapi import APIRouter, Depends
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.db import get_db
from app.schemas.orders import PromoCheck
from app.services.promos import validate_promo

router = APIRouter(prefix="/promos", tags=["promos"])


@router.post("/validate")
def check_promo(body: PromoCheck, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    """Preview a promo against the cart subtotal before the order is placed."""
    promo, discount = validate_promo(db, body.code, user.id, body.subtotal)
    return {"code": promo["code"], "description": promo.get("description"), "discount": float(discount), "total": round(body.subtotal - float(discount), 2)}
