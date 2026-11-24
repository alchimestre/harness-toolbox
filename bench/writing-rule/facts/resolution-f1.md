# Ticket thread, closing now (PRC-88: "Price cache serves an old price after a sale ends")

Problem as filed by support: customers see the pre-sale price for up to 20 minutes after a sale ends. Three orders were charged the sale price after it expired (SUP-6011).

Thread highlights over two weeks (2024-09-02 to 2024-09-16): the pricing team wanted a per-SKU TTL, so each product could have its own expiry. The platform engineer showed that the TTL is set once per key at write time, so a per-SKU TTL still misses a change made just after a write. The pricing lead agreed a per-SKU TTL was not enough. The on-call engineer proposed purging the affected SKUs on the sale-end event instead of a shorter TTL. Nobody objected.

Decision: the cache TTL is 60 seconds for every SKU. A sale-end event purges the affected SKUs at once. No per-SKU TTL.

Reason a later reader would get wrong: people will ask for per-SKU TTLs. A TTL alone cannot be correct, because a change right after a write is missed until the entry expires. The purge closes that gap.

Limits: the purge is best effort across regions; the TTL is the backstop. A cache miss costs about 40 ms on the pricing service.

Owner: the platform engineer. Shipped in 4.2.0 (released 2024-09-30). Doc page: docs.example.com/pricing/cache.
