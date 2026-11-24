class MemoryStore:
    def __init__(self):
        self._rows = {}

    def get(self, sub_id):
        return self._rows[sub_id]

    def save(self, sub):
        self._rows[sub.sub_id] = sub

    def all(self):
        return self._rows.values()

    def delete(self, sub_id):
        del self._rows[sub_id]
