from dataclasses import dataclass
from datetime import datetime


class Plan:
    def __init__(self, code, price_cents):
        self.code = code
        self.price_cents = price_cents


CATALOG = (
    Plan("basic", 900),
    Plan("pro", 2400),
    Plan("team", 4900),
)


@dataclass(eq=False, repr=False)
class Subscription:
    sub_id: str
    customer_id: str
    plan: Plan
    period_start: datetime
    period_end: datetime
