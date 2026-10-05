from decimal import Decimal


def _d(x) -> Decimal:
    return Decimal(str(x))


def plan_refund(total_paid, already_refunded, requested=None) -> tuple[Decimal, str]:
    """Return (amount, resulting payment_status). `requested=None` refunds whatever is left.
    Raises ValueError when there is nothing to refund or the request exceeds the balance."""
    total, done = _d(total_paid), _d(already_refunded)
    remaining = total - done
    if remaining <= 0:
        raise ValueError("This order has already been fully refunded")
    amount = remaining if requested is None else _d(requested).quantize(Decimal("0.01"))
    if amount <= 0:
        raise ValueError("Refund amount must be greater than zero")
    if amount > remaining:
        raise ValueError(f"Refund exceeds the remaining balance of ₹{remaining}")
    return amount, ("refunded" if done + amount >= total else "partially_refunded")
