from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.db import get_db
from app.services.channels import push_ready

router = APIRouter(prefix="/push", tags=["push"])


class Keys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=5, max_length=100)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=2000, pattern=r"^https://")
    keys: Keys


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.get("/vapid-key")
def vapid_key(settings: Settings = Depends(get_settings)):
    """Public key the browser needs to create a push subscription."""
    if not push_ready(settings):
        raise HTTPException(503, "Push notifications are not configured")
    return {"public_key": settings.vapid_public_key}


@router.post("/subscribe", status_code=201)
def subscribe(body: SubscriptionIn, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    row = {"user_id": user.id, "endpoint": body.endpoint, "p256dh": body.keys.p256dh, "auth": body.keys.auth}
    existing = db.table("push_subscriptions").select("id, user_id").eq("endpoint", body.endpoint).execute().data
    if existing:  # same browser re-subscribing (possibly after a different user logged in on it)
        db.table("push_subscriptions").update(row).eq("id", existing[0]["id"]).execute()
    else:
        db.table("push_subscriptions").insert(row).execute()
    return {"subscribed": True}


@router.post("/unsubscribe", status_code=204)
def unsubscribe(body: UnsubscribeIn, user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    db.table("push_subscriptions").delete().eq("endpoint", body.endpoint).eq("user_id", user.id).execute()
