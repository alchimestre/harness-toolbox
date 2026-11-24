# Ticket thread, closing now (API-1204: "Events API drops rows while paging")

Problem as filed by a client developer: clients paging through `/v1/events` with `?offset=` miss or repeat events when new events arrive during the paging.

Thread highlights over three weeks (2024-05-06 to 2024-05-27): the API lead argued for keeping offset paging and holding a database snapshot open per client. The platform engineer measured it: a snapshot held for a slow client pins memory, 200 slow clients used 6 GB. The API lead withdrew. The platform engineer proposed cursor paging: each response carries `next_cursor`, an opaque token encoding the last (created_at, id) pair; the next call passes `?cursor=`. The SDK maintainer raised that v1 clients cannot change quickly. Nobody objected to cursors after that.

Decision: `/v2/events` uses cursor paging only. `offset` is not supported on v2. `/v1/events` keeps offset paging unchanged and is frozen until 30 June, after which it is removed.

Reason a later reader would get wrong: people assume offset is "simpler" and will ask for it back. It cannot be made correct: inserts shift every row after the insertion point, so a client between pages skips or repeats rows. Cursors are stable because they anchor on the last row seen, not a position.

Limits: cursors expire after 24 hours. Page size max 500.

Owner: the platform engineer. Shipped in 2.5.0 (released 2024-06-03). Doc page: docs.example.com/api/events-paging.
