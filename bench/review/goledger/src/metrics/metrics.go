package metrics

import "sync/atomic"

// Counters tracks ledger operations.
type Counters struct {
	Posts    atomic.Int64
	Replays  atomic.Int64
	Balances atomic.Int64
}

// Snapshot returns the counters as plain values for export.
func (c *Counters) Snapshot() map[string]int64 {
	return map[string]int64{
		"posts":    c.Posts.Load(),
		"replays":  c.Replays.Load(),
		"balances": c.Balances.Load(),
	}
}
