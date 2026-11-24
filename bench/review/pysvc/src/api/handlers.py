from billing.invoices import preview_change
from billing.models import CATALOG


def handle_preview(service, sub_id, plan_code, now):
    sub = service.store.get(sub_id)
    plan = next(plan for plan in CATALOG if plan.code == plan_code)
    return preview_change(sub, plan, now)


def handle_change(service, sub_id, plan_code, now):
    plan = next(plan for plan in CATALOG if plan.code == plan_code)
    sub = service.change_plan(sub_id, plan, now)
    return {"sub_id": sub.sub_id, "plan": sub.plan.code, "status": "ok"}


def handle_upgrades(service, sub_id):
    sub = service.store.get(sub_id)
    return [plan.code for plan in service.upgrade_options(sub.plan, CATALOG)]


def handle_sweep(service, now):
    return {"expired": service.expire_stale(now)}
