from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import admin, health, me, notifications, orders, partner, payments, promos, shop_dashboard, shops

app = FastAPI(title="Poshak API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",  # any local dev port
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(shops.router)
for r in (me, orders, partner, shop_dashboard, payments, promos, notifications, admin):
    app.include_router(r.router)
