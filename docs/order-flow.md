# Order flow

placed → pickup_assigned → picked_up → weighed → washing → ready → out_for_delivery → delivered

`cancelled` is allowed only from `placed` and `pickup_assigned`.
Source of truth: `backend/app/schemas/orders.py` (`TRANSITIONS`).

Pricing: the customer sees an **estimate** at checkout. The partner records the real weight at pickup
(`weighed`), which sets `final_amount`; payment is captured against that.
