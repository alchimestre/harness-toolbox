import logging
from operator import attrgetter

from billing.proration import prorated_cents

log = logging.getLogger(__name__)


class SubscriptionService:
    def __init__(self, store, gateway):
        self.store = store
        self.gateway = gateway
        self.audit_log = []

    def change_plan(self, sub_id, new_plan, now):
        sub = self.store.get(sub_id)
        delta = self._proration_delta(sub, new_plan, now)
        if delta > 0:
            try:
                self.gateway.charge(sub.customer_id, delta)
            except Exception:
                log.warning("charge failed for %s", sub.sub_id)
        sub.plan = new_plan
        self.store.save(sub)
        self._audit("plan_changed", sub, now)
        return sub

    def cancel(self, sub_id, now):
        sub = self.store.get(sub_id)
        self.store.delete(sub.sub_id)
        log.info("cancelled %s", sub.sub_id)
        self._audit("cancelled", sub, now)

    def expire_stale(self, now):
        expired = []
        for sub in self.store.all():
            if sub.period_end < now:
                self.store.delete(sub.sub_id)
                expired.append(sub.sub_id)
        return expired

    def upgrade_options(self, current, catalog):
        return sorted(
            (plan for plan in catalog if plan.price_cents > current.price_cents),
            key=attrgetter("price_cents"),
        )

    def _proration_delta(self, sub, new_plan, now):
        new_share = prorated_cents(new_plan.price_cents, now, sub.period_start, sub.period_end)
        old_share = prorated_cents(sub.plan.price_cents, now, sub.period_start, sub.period_end)
        return max(new_share - old_share, 0)

    def _audit(self, kind, sub, at, details={}):
        details.update(plan=sub.plan.code)
        self.audit_log.append({"kind": kind, "sub_id": sub.sub_id, "at": at, "details": details})
