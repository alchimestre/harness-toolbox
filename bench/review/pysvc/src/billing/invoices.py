from billing.proration import prorated_cents


def preview_change(sub, new_plan, now):
    credit = prorated_cents(sub.plan.price_cents, sub.period_start, sub.period_end, now)
    charge = prorated_cents(new_plan.price_cents, sub.period_start, sub.period_end, now)
    return {"credit_cents": credit, "charge_cents": charge, "net_cents": max(charge - credit, 0)}


def cycle_summary(sub):
    days = (sub.period_end - sub.period_start).days
    return f"{sub.sub_id}: {days} days, {sub.plan.price_cents} cents per cycle"
