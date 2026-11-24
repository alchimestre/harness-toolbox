"""In-memory FIFO outbox for pending notifications."""


class Outbox:
    """Holds messages in arrival order until they are drained."""

    def __init__(self) -> None:
        self._messages: list[str] = []

    def __len__(self) -> int:
        return len(self._messages)

    def enqueue(self, message: str) -> None:
        """Append a message to the end of the queue."""
        self._messages.append(message)

    def drain(self) -> list[str]:
        """Return all queued messages in FIFO order and empty the outbox."""
        messages = self._messages
        self._messages = []
        return messages
