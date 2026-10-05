from fastapi import HTTPException
from supabase import Client

BUCKET = "order-photos"
MAX_PHOTOS = 6
SIGNED_URL_SECONDS = 3600


def validate_photo_paths(paths: list[str], user_id: str) -> list[str]:
    """Photos are uploaded straight to storage by the browser; only accept paths inside the
    caller's own folder so nobody can attach someone else's files to an order."""
    if len(paths) > MAX_PHOTOS:
        raise HTTPException(422, f"You can attach up to {MAX_PHOTOS} photos")
    for p in paths:
        if not p.startswith(f"{user_id}/") or ".." in p or p.endswith("/"):
            raise HTTPException(422, "Invalid photo path")
    return paths


def attach_photo_urls(db: Client, orders: list[dict]) -> list[dict]:
    """Replace each order's `order_photos` rows with `{id, url}` signed URLs (one storage call)."""
    paths = [p["path"] for o in orders for p in o.get("order_photos") or []]
    urls: dict[str, str] = {}
    if paths:
        for item in db.storage.from_(BUCKET).create_signed_urls(paths, SIGNED_URL_SECONDS):
            if item.get("signedURL") and not item.get("error"):
                urls[item["path"]] = item["signedURL"]
    for o in orders:
        o["order_photos"] = [{"id": p["id"], "url": urls[p["path"]]} for p in o.get("order_photos") or [] if p["path"] in urls]
    return orders
