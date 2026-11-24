from billing.gateway import Gateway
from billing.service import SubscriptionService
from billing.store import MemoryStore


def build_service(client):
    return SubscriptionService(MemoryStore(), Gateway(client))
