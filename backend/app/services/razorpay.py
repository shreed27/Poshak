import hashlib
import hmac

import httpx

API = "https://api.razorpay.com/v1"


def verify_signature(secret: str, razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> bool:
    expected = hmac.new(secret.encode(), f"{razorpay_order_id}|{razorpay_payment_id}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def create_order(key_id: str, key_secret: str, amount_rupees: float, receipt: str) -> dict:
    res = httpx.post(
        f"{API}/orders",
        auth=(key_id, key_secret),
        json={"amount": round(amount_rupees * 100), "currency": "INR", "receipt": receipt},
        timeout=15,
    )
    res.raise_for_status()
    return res.json()


def verify_webhook_signature(secret: str, raw_body: bytes, signature: str) -> bool:
    """Razorpay signs the *raw* request body with the webhook secret (HMAC-SHA256, hex)."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def create_refund(key_id: str, key_secret: str, payment_id: str, amount_rupees: float, receipt: str) -> dict:
    res = httpx.post(
        f"{API}/payments/{payment_id}/refund",
        auth=(key_id, key_secret),
        json={"amount": round(amount_rupees * 100), "receipt": receipt},
        timeout=15,
    )
    res.raise_for_status()
    return res.json()
