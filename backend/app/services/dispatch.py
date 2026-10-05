"""Automatic partner assignment and live tracking.

Rules (kept simple and predictable): only partners who are online with a location fresher than
LOCATION_MAX_AGE, within MAX_RADIUS_KM of the pickup address and carrying fewer than MAX_ACTIVE_JOBS
are eligible. The nearest wins, with each job already on their plate counting as JOB_PENALTY_KM extra."""
import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from supabase import Client

from app.schemas.orders import OrderStatus
from app.services.notify import notify
from app.services.orders import apply_status

log = logging.getLogger("poshak.dispatch")

MAX_ACTIVE_JOBS = 3
MAX_RADIUS_KM = 15.0
JOB_PENALTY_KM = 1.5
LOCATION_MAX_AGE = timedelta(minutes=10)
AVG_SPEED_KMH = 20.0
TRACKED_STATUSES = {"pickup_assigned", "out_for_delivery"}


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def eta_minutes(km: float) -> int:
    return max(1, math.ceil(km / AVG_SPEED_KMH * 60))


@dataclass
class Candidate:
    partner_id: str
    lat: float
    lng: float
    active_jobs: int = 0


def pick_partner(lat: float, lng: float, candidates: list[Candidate], exclude: set[str] | frozenset[str] = frozenset()) -> Candidate | None:
    best, best_score = None, math.inf
    for c in candidates:
        if c.partner_id in exclude or c.active_jobs >= MAX_ACTIVE_JOBS:
            continue
        d = haversine_km(lat, lng, c.lat, c.lng)
        if d > MAX_RADIUS_KM:
            continue
        score = d + JOB_PENALTY_KM * c.active_jobs
        if score < best_score:
            best, best_score = c, score
    return best


def _fresh(ts: str | None) -> bool:
    if not ts:
        return False
    return datetime.now(timezone.utc) - datetime.fromisoformat(ts.replace("Z", "+00:00")) <= LOCATION_MAX_AGE


def load_candidates(db: Client) -> list[Candidate]:
    rows = [r for r in db.table("partner_status").select("*").eq("is_online", True).execute().data
            if r["lat"] is not None and r["lng"] is not None and _fresh(r["updated_at"])]
    if not rows:
        return []
    ids = [r["partner_id"] for r in rows]
    busy = db.table("orders").select("partner_id").in_("partner_id", ids).not_.in_("status", ["delivered", "cancelled"]).execute().data
    return [Candidate(r["partner_id"], r["lat"], r["lng"], sum(1 for o in busy if o["partner_id"] == r["partner_id"])) for r in rows]


def _address_point(db: Client, address_id: str) -> tuple[float, float] | None:
    rows = db.table("addresses").select("lat, lng").eq("id", address_id).execute().data
    if rows and rows[0]["lat"] is not None and rows[0]["lng"] is not None:
        return rows[0]["lat"], rows[0]["lng"]
    return None


def auto_assign(db: Client, order: dict) -> dict | None:
    """Try to put a `placed` order on the best nearby partner. Returns the updated order or None."""
    point = _address_point(db, order["address_id"])
    if point is None:
        return None
    cand = pick_partner(*point, load_candidates(db), exclude=set(order.get("declined_by") or []))
    if cand is None:
        return None
    claimed = (  # conditional claim, so a partner accepting at the same moment wins cleanly
        db.table("orders").update({"partner_id": cand.partner_id, "assigned_by": "auto"})
        .eq("id", order["id"]).is_("partner_id", "null").eq("status", "placed").execute().data
    )
    if not claimed:
        return None
    updated = apply_status(db, claimed[0], OrderStatus.PICKUP_ASSIGNED, None)
    notify(db, cand.partner_id, "New pickup assigned", "A nearby pickup was assigned to you.", order["id"], external=True)
    return updated


def dispatch_waiting(db: Client, limit: int = 20) -> int:
    """Assign any unassigned orders (e.g. placed while no partner was online). Returns how many were assigned."""
    waiting = db.table("orders").select("*").eq("status", "placed").is_("partner_id", "null").order("created_at").limit(limit).execute().data
    assigned = 0
    for o in waiting:
        try:
            assigned += 1 if auto_assign(db, o) else 0
        except Exception:  # dispatch is best-effort and must never break the caller
            log.exception("auto-assign failed for order %s", o["id"])
    return assigned


def partner_tracking(db: Client, order: dict) -> dict | None:
    """How far the assigned partner is from the customer's address. Exposes distance/ETA only, not coordinates."""
    if order["status"] not in TRACKED_STATUSES or not order.get("partner_id"):
        return None
    point = _address_point(db, order["address_id"])
    st = db.table("partner_status").select("*").eq("partner_id", order["partner_id"]).execute().data
    if point is None or not st or st[0]["lat"] is None or not _fresh(st[0]["updated_at"]):
        return None
    prof = db.table("profiles").select("full_name").eq("id", order["partner_id"]).execute().data
    km = haversine_km(*point, st[0]["lat"], st[0]["lng"])
    return {
        "name": (prof[0]["full_name"] or "Your partner").split()[0] if prof else "Your partner",
        "distance_km": round(km, 1), "eta_minutes": eta_minutes(km), "updated_at": st[0]["updated_at"],
        "heading": "pickup" if order["status"] == "pickup_assigned" else "delivery",
    }
