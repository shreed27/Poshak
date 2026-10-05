from decimal import Decimal


def _d(x) -> Decimal:
    return Decimal(str(x))


def estimate(lines: list[dict]) -> Decimal:
    """lines: [{unit_price, quantity}] -> sum, as quoted at checkout."""
    return sum((_d(l["unit_price"]) * _d(l["quantity"]) for l in lines), Decimal(0))


def final_amount(lines: list[dict], weight_kg: float) -> Decimal:
    """lines: [{unit_price, quantity, unit}]. Per-kg services bill on the weighed total,
    per-piece services bill on the counted quantity."""
    total = Decimal(0)
    for l in lines:
        qty = _d(weight_kg) if l["unit"] == "kg" else _d(l["quantity"])
        total += _d(l["unit_price"]) * qty
    return total.quantize(Decimal("0.01"))
