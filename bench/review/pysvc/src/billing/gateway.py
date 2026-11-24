class PaymentDeclined(Exception):
    pass


class Gateway:
    def __init__(self, client):
        self.client = client

    def charge(self, customer_id, cents):
        response = self.client.create_charge(customer=customer_id, amount=cents, currency="eur")
        if response["status"] != "succeeded":
            raise PaymentDeclined(f"{customer_id}: {response['status']}")
        return response["id"]
