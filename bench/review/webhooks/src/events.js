function redeliveryOf(event, attempt) {
  return { ...event, id: `${event.id}:${attempt}` };
}

module.exports = { redeliveryOf };
