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
