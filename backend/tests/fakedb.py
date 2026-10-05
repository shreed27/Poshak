"""A small in-memory stand-in for the supabase-py client, enough to run the API routes in tests.
Supports select (with embedded relations), insert, update, upsert, delete and the filters the app uses."""
import copy
import itertools
import re
import uuid

# (table, embed_name) -> (target_table, local_key, target_key, many)
RELATIONS = {
    ("orders", "shops"): ("shops", "shop_id", "id", False),
    ("orders", "addresses"): ("addresses", "address_id", "id", False),
    ("orders", "order_items"): ("order_items", "id", "order_id", True),
    ("orders", "order_events"): ("order_events", "id", "order_id", True),
    ("orders", "order_photos"): ("order_photos", "id", "order_id", True),
    ("order_items", "services"): ("services", "service_id", "id", False),
    ("shops", "services"): ("services", "id", "shop_id", True),
}
_clock = itertools.count(1)


def _split_top(s: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip()); cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload, self.cols = "select", None, "*"
        self.filters, self.order_by, self.max, self.neg = [], None, None, False

    # ---- builders ----
    def select(self, cols="*"): self.op, self.cols = "select", cols; return self
    def insert(self, rows): self.op, self.payload = "insert", rows; return self
    def update(self, vals): self.op, self.payload = "update", vals; return self
    def upsert(self, rows): self.op, self.payload = "upsert", rows; return self
    def delete(self): self.op = "delete"; return self
    def limit(self, n): self.max = n; return self
    def order(self, col, desc=False): self.order_by = (col, desc); return self

    @property
    def not_(self): self.neg = True; return self

    def _f(self, col, test):
        neg, self.neg = self.neg, False
        self.filters.append(lambda r: (not test(r.get(col))) if neg else test(r.get(col)))
        return self

    def eq(self, c, v): return self._f(c, lambda x: x == v)
    def neq(self, c, v): return self._f(c, lambda x: x != v)
    def in_(self, c, vs): return self._f(c, lambda x: x in vs)
    def is_(self, c, v): return self._f(c, lambda x: x is None if v == "null" else x == v)
    def gt(self, c, v): return self._f(c, lambda x: x is not None and x > v)
    def gte(self, c, v): return self._f(c, lambda x: x is not None and x >= v)
    def lt(self, c, v): return self._f(c, lambda x: x is not None and x < v)
    def lte(self, c, v): return self._f(c, lambda x: x is not None and x <= v)
    def ilike(self, c, v): return self._f(c, lambda x: x is not None and x.lower() == v.lower())

    # ---- execution ----
    def _matching(self):
        rows = [r for r in self.db.tables.setdefault(self.table, []) if all(f(r) for f in self.filters)]
        if self.order_by:
            col, desc = self.order_by
            rows = sorted(rows, key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        return rows[: self.max] if self.max else rows

    def _project(self, row):
        out = copy.deepcopy(row)
        for part in _split_top(self.cols):
            m = re.match(r"(\w+)\((.*)\)$", part, re.S)
            if not m:
                continue
            name, inner = m.groups()
            target, lk, tk, many = RELATIONS[(self.table, name)]
            sub = Query(self.db, target)
            sub.cols = inner
            related = [sub._project(r) for r in self.db.tables.get(target, []) if r.get(tk) == row.get(lk)]
            out[name] = related if many else (related[0] if related else None)
        return out

    def execute(self):
        t = self.db.tables.setdefault(self.table, [])
        if self.op == "select":
            return Result([self._project(r) for r in self._matching()])
        if self.op in ("insert", "upsert"):
            rows = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for r in rows:
                r = copy.deepcopy(r)
                if self.op == "upsert":
                    existing = next((x for x in t if x.get("id") == r.get("id")), None)
                    if existing:
                        existing.update(r); out.append(copy.deepcopy(existing)); continue
                r.setdefault("id", str(uuid.uuid4()))
                r.setdefault("created_at", f"2026-01-01T00:00:{next(_clock):06d}+00:00")
                for k, v in self.db.defaults.get(self.table, {}).items():
                    r.setdefault(k, v)
                t.append(r); out.append(copy.deepcopy(r))
            return Result(out)
        if self.op == "update":
            rows = self._matching()
            for r in rows:
                r.update(copy.deepcopy(self.payload))
            return Result([copy.deepcopy(r) for r in rows])
        if self.op == "delete":
            rows = self._matching()
            self.db.tables[self.table] = [r for r in t if r not in rows]
            return Result([copy.deepcopy(r) for r in rows])


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.defaults = {
            "orders": {"payment_status": "pending", "partner_id": None, "final_amount": None, "weight_kg": None,
                       "rating": None, "review": None, "refunded_amount": 0, "discount_amount": 0, "promo_code": None, "assigned_by": None, "declined_by": []},
            "services": {"is_active": True},
            "shops": {"is_active": True},
            "notifications": {"read_at": None},
            "promo_codes": {"is_active": True},
        }

    def table(self, name): return Query(self, name)

    def seed(self, name, rows):
        for r in rows:
            self.table(name).insert(r).execute()
        return self
