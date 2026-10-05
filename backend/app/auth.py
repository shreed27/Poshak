from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.config import Settings, get_settings
from app.db import get_db

bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    phone: str | None
    role: str  # customer | partner | shop | admin


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """Verify the Supabase JWT; the role comes from `profiles` so changes apply immediately."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing token")
    try:
        claims = jwt.decode(
            creds.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    db: Client = get_db()
    rows = db.table("profiles").select("role").eq("id", claims["sub"]).execute().data
    return CurrentUser(
        id=claims["sub"],
        phone=claims.get("phone"),
        role=rows[0]["role"] if rows else "customer",
    )


def require_role(*roles: str):
    def dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not allowed")
        return user

    return dep
