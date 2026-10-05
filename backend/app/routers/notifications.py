from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from supabase import Client

from app.auth import CurrentUser, get_current_user
from app.db import get_db

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    rows = db.table("notifications").select("*").eq("user_id", user.id).order("created_at", desc=True).limit(50).execute().data
    return {"unread": sum(1 for r in rows if r["read_at"] is None), "items": rows}


@router.post("/read-all", status_code=204)
def read_all(user: CurrentUser = Depends(get_current_user), db: Client = Depends(get_db)):
    db.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()}).eq("user_id", user.id).is_("read_at", "null").execute()
