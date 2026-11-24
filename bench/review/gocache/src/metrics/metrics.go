package metrics

import "sync/atomic"

// Counters tracks request outcomes for the cache service.
type Counters struct {
	Hits    atomic.Int64
	Misses  atomic.Int64
	Writes  atomic.Int64
	Deletes atomic.Int64
}

// Snapshot returns the counters as plain values for export.
func (c *Counters) Snapshot() map[string]int64 {
	return map[string]int64{
		"hits":    c.Hits.Load(),
		"misses":  c.Misses.Load(),
		"writes":  c.Writes.Load(),
		"deletes": c.Deletes.Load(),
	}
}
